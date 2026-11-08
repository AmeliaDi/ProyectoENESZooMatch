# Changelog: huevos atascados (Fase 2)

Fecha: 2026-11-08 · Modo: diagnóstico + infraestructura preventiva

## Estado de producción al momento del diagnóstico

| Cohorte | Descripción | Cantidad | Acción |
|---------|-------------|----------|--------|
| (a) | Nunca completaron el núcleo (0 respuestas) | 44 activos + 11 eliminados | No tocar |
| (b) | Completaron con revisión anterior del banco | 0 | — |
| (c) | Núcleo completo pero eclosión falló | 0 | — |
| (d) | Elegibles pero nunca se disparó | 0 | — |

**Resultado:** no hay huevos que backfillear. Los 55 huevos registrados tienen
`quiz_completed_at = NULL` y cero filas en `quiz_responses`. Son personas que
se registraron pero nunca contestaron el test.

## Política de cohortes (para futuras ejecuciones)

- **(a)** No se tocan. Sin respuestas no hay identidad posible.
- **(b)** Eclosionar con las respuestas disponibles; los ítems nuevos del banco
  son opcionales (el núcleo de 53 ítems requeridos no cambia entre revisiones
  mientras `hatch_required_modules = ["nucleo"]`).
- **(c)** Reintentar la eclosión (el reconciliador lo hace automáticamente).
- **(d)** Eclosionar idempotentemente (el reconciliador lo hace automáticamente).
- **Ya eclosionados** (`eclosionado_en IS NOT NULL`): nunca se recalculan ni
  renombran. Regla de oro (ADR-038).

## Infraestructura creada (Fase 1)

1. `src/domain/psychometrics/core-complete.ts` — `isCoreComplete`: fuente única
   de verdad, devuelve ítems faltantes exactos.
2. `src/application/hatch.ts` — eclosión robusta con logging estructurado,
   retry/backoff exponencial (100–800 ms, 3 reintentos) para fallos transitorios.
3. `src/application/reconcile-eggs.ts` — reconciliador periódico que escanea
   huevos activos, eclosiona elegibles, recalcula matches y notifica.
4. `src/app/api/cron/reconcile/route.ts` — endpoint protegido por CRON_SECRET.
5. `vercel.json` — cron cada 30 minutos (`*/30 * * * *`).
6. `ProfileRepository.listEggUserIds()` — método para el reconciliador.

## Script de backfill existente

`scripts/identity-backfill.mts` ya implementa:
- Dry-run por defecto (`BEGIN … ROLLBACK`).
- `--apply --confirm` para escritura real.
- `--check` para solo lectura (exit 1 si hay trabajo pendiente).
- Reporte seudónimo (`P-###-TAG`), nunca matrículas ni respuestas.
- Invariantes dentro de la transacción (rollback si alguna se rompe).
- No toca identidades congeladas (`eclosionado_en IS NOT NULL`).

No fue necesario ejecutarlo: no hay cohortes (b), (c) ni (d).

## Verificación

- `npm run check` en verde (1230 tests, 0 fallos).
- Typecheck limpio.
- El reconciliador encontrá 0 elegibles en la próxima ejecución (todos los
  huevos tienen 0 respuestas).

## Respaldo

Antes de cualquier migración o relleno futuro:
```bash
node --no-warnings scripts/db-backup.mts --tables profiles,quiz_responses,matches,notifications,chat_interests,conversations
```
Restauración:
```bash
node --no-warnings scripts/db-restore.mts --file backups/<timestamp>.sql --confirm
```