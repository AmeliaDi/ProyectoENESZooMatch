# Corrección de Huevos — Plan de Despliegue

**Fecha:** 2026-11-08
**Rama:** main
**Migraciones nuevas:** ninguna (usa tablas existentes)

---

## Cambios en este release

| Área | Cambio |
|------|--------|
| Dominio | `isCoreComplete` fuente única; `hatch-condition` delega |
| Aplicación | `ensureIdentity` con retry/backoff; `reconcileEggs` cron |
| API | `/api/cron/reconcile` (Bearer CRON_SECRET) |
| Infraestructura | `listEggUserIds` en profile-repository; cron en vercel.json |
| UI | parseProfile egg guard; "Te faltan N preguntas"; 0-match por track |
| CSS | Ligaduras deshabilitadas globalmente; /dev/tipografia |
| Tests | +30 tests (core-complete, hatch, reconciler, parse-profile, ligaduras) |

---

## Pre-requisitos

1. `npm run check` en verde (typecheck + lint + 1260 tests).
2. `CRON_SECRET` configurado en Vercel (ya existe para retention).
3. Respaldo verificado: `node --no-warnings scripts/db-backup.mts --apply --confirm`.
4. Token de Supabase Management API vigente (para verificación post-deploy).

---

## Secuencia de despliegue

### 1. Preview

```bash
git push origin main
# Vercel genera preview automáticamente.
```

Verificar en preview:
- [ ] `/dev/tipografia` muestra "afinidades" y "perfil" sin ligaduras.
- [ ] Enviar quiz parcial → reveal muestra "Te faltan N preguntas".
- [ ] Enviar quiz completo → eclosiona correctamente.
- [ ] `/perfil` como huevo → error state, no muestra MBTI/narrativa.

### 2. Producción

```bash
# Vercel promove a producción desde main (o manual):
vercel --prod
```

No hay migraciones que aplicar. El cron se registra automáticamente desde `vercel.json`.

### 3. Verificar cron reconciler

```bash
# Disparar manualmente (primera vez):
curl -X POST https://zoomatch.vercel.app/api/cron/reconcile \
  -H "Authorization: Bearer $CRON_SECRET"
```

Respuesta esperada (estado actual: 55 huevos cohort a, 0 elegibles):
```json
{"eggsScanned":55,"eligible":0,"hatched":0,"alreadyHatched":0,"failed":0,"notEligible":55,"matchesRecomputed":false,"notified":0}
```

### 4. Verificar pool

```bash
node --no-warnings scripts/verify-pool.mts --simulate
```

O vía SQL (Supabase dashboard):
```sql
SELECT count(*) FROM profiles
WHERE estado_identidad = 'eclosionado'
  AND quiz_completed_at IS NOT NULL
  AND paused_at IS NULL AND eliminado_en IS NULL;
-- Esperado: 161 (toda persona activa eclosionada)
```

---

## Canary permanente

El cron `/api/cron/reconcile` cada 30 min actúa como canary:
- Si `failed > 0` de forma sostenida → alerta en logs (`reconcile.hatch_failed`).
- Si `eggsScanned` crece sin `hatched` → revisar `isCoreComplete` o bank revision.
- Monitorear: `logServerEvent("info", "reconcile.complete", {...})`.

Alerta manual (Sentry / Vercel logs):
```
event:reconcile.hatch_failed OR event:hatch.self_repair_failed
```

---

## Rollback

Si el deploy introduce regresiones:

```bash
# Vercel instant rollback:
vercel rollback
```

Efectos del rollback:
- El cron deja de ejecutarse (vercel.json anterior no lo tiene).
- Los huevos ya eclosionados por el reconciler PERMANECEN eclosionados (la identidad es frozen, no se revierte).
- El CSS de ligaduras vuelve al estado anterior (bug visual regresa).
- No hay pérdida de datos: ninguna migración destructiva.

Si se necesita deshacer eclosiones incorrectas (improbable):
```sql
-- Sólo para ids específicos, nunca masivo:
UPDATE profiles SET estado_identidad = 'huevo', alias_completo = NULL, ...
WHERE user_id = '<uuid>';
```

---

## Verificación post-deploy (checklist)

- [ ] Cron responde 200 con summary JSON.
- [ ] 0 huevos con núcleo completo sin eclosionar (eligible = 0).
- [ ] Ligaduras corregidas en producción.
- [ ] `/perfil` como huevo no expone identidad.
- [ ] 1260 tests en verde en CI.
- [ ] Logs estructurados visibles en Vercel (reconcile.complete).