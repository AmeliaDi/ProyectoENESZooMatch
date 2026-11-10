# Runbook — ZooMatch

> Referencia para quien atiende la base y la app durante el evento. Cada comando
> existe en `package.json` y cada número citado sale de una corrida guardada en
> `.qa/`. Si una sección describe algo que no puedes reproducir, el texto está
> mal y se corrige aquí mismo.

## 0. Reglas que no se negocian

1. **Nadie escribe en producción desde un agente.** Todo lo que un agente corre
   contra el proyecto remoto es lectura con el guardia de `scripts/db/lib.mjs`,
   que rechaza cualquier verbo de escritura antes de mandar la consulta
   (`assertReadOnly`). Las escrituras son pasos manuales listados en
   `docs/PENDIENTES_MANUALES.md`.
2. **Respaldo antes de escribir.** Ver `docs/RESPALDOS.md` §1. Sin `manifest.json`
   verificado, el paso se detiene.
3. **No se exportan filas de producción.** Los comandos que leen la base remota
   devuelven metadatos y `count(*)`. Punto.
4. **Valores numéricos en config.** Un número nuevo en un script sin su entrada
   en `data/*.json` (con `valor`, `etiqueta` y `fuente`) no se aprueba.
5. **El servidor de la persona que opera no se toca.** El dev server en `:3000`
   es de quien trabaja; las pruebas levantan los suyos en otros puertos.

## 1. Diagnóstico en orden

```bash
npm run check            # secrets + lint + typecheck + tests + db:test
npm run verify:invariants  # 14 invariantes de negocio sobre datos sintéticos
npm run verify:rollout     # las compuertas de data/rollout-gates.json contra .qa/rollout.json
npm run verify:all         # diez pasos: check, data:validate, invariants, rollout,
                           # cinco db:* y qa:chat; imprime el tiempo de cada uno
```

`verify:all` (`scripts/verify/run-all.mjs`) no solo mira el código de salida:
exige que cada paso deje su evidencia en `.qa/*.json`, y un paso que reporta
`status: "skipped"` cuenta como OMITIDO, no como verde. Eso es deliberado: un
paso sin credenciales no puede fingir que midió algo. El único paso que puede
quedar verde sin haber medido nada es `qa:chat`, porque no escribe evidencia: sin
`CHAT_E2E_BASE` levanta un archivo con una prueba saltada y sale con código 0.

Orden sugerido cuando algo huele mal después de una migración:

```bash
npm run db:drift        # ¿el esquema vivo cambió sin estar documentado?
npm run db:migrate-test # ¿la base local y la remota siguen siendo el mismo esquema?
npm run db:audit        # 10 consultas numeradas, 228 renglones: 113 aserciones + 115 informativos, 0 violaciones
npm run db:perf         # presupuestos de latencia
npm run db:restore-drill# ¿el respaldo sigue siendo restaurable? (base desechable)
```

## 2. Síntoma → causa → acción

| Síntoma | Primero mirar | Causa probable | Acción |
|---|---|---|---|
| Un match no aparece aunque la afinidad es alta | `npm run db:audit` → `03_pares.sql`; tabla `matches` | el par está fuera del top-k, o uno de los dos tiene `eliminado_en` y `private.live_pairs()` lo excluye | no es un bug: es la regla vigente. Si el umbral cambió, es decisión de umbral (pedir OK explícito) |
| `matches.similarity = 0` falla al escribir | `00000000000000_base.sql:165` `CHECK (similarity > 0 AND similarity <= 1)` | el dominio del motor es `[0,1]` y la cota inferior es excluyente (DB-10) | filtrar el 0 antes de mandar el payload o aflojar el CHECK; las dos opciones cambian una cota, así que requieren decisión |
| El panel de administración tarda segundos | `npm run db:perf` → `get_admin_dashboard` | 1427 ms de mediana local: `private.live_pairs()` se invoca 24 veces dentro de la misma lectura (DB-07) | presupuesto vigente 4348 ms; la optimización (CTE común por track) está pendiente y es de producto |
| El aviso «-x» no desaparece del marcador | `npm run db:audit` → `06_notificaciones.sql` | la purga del contador no cubría la forma que vive en la base | ya corregido (`7bf8981`); si revive, es una forma nueva y va a `docs/QA_DB.md` |
| Dos mensajes aparecen en orden incorrecto | `src/infrastructure/chat/conversation-repository.ts:184` | el poll ordena solo por `created_at` y el `id` es UUID (DB-14) | confirmado como riesgo, sin corrección: hace falta una columna de secuencia |
| Un chat abierto quedó sin tarjeta de match | `npm run db:audit` → `04_conservacion.sql`; renglones `conversaciones sin par vigente en matches` (71) y `conversaciones abiertas desde el ultimo recálculo sin par vigente` (5) | el recálculo ordinario no protege las conversaciones: `recomputeMatches` llama `replaceAll` y la `replace_matches` vigente borra sin mirar atrás (DB-19) | no es un arreglo de umbral: es el paso M-13. El mecanismo ya está escrito y probado en `supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql` (prueba: `supabase/tests/05_conservacion.sql`); falta que una persona la aplique. Hasta entonces la conversación sobrevive y el par visible no |
| `db:drift` falla | diff impreso contra `supabase/schema-snapshot.json` | una migración aplicó algo no documentado, o la plataforma cambió un objeto | regenerar el snapshot con `npm run db:schema` **solo si** el cambio es intención nuestra; si no, es el drift el que tiene razón |
| `db:restore-drill` falla en las guardas del sobre | `.qa/db-restore-drill.json` → `sobre.guardas` | el respaldo se truncó o el destino tiene otro esquema | eso es el control funcionando; revisar `respaldo.sha256` contra el artefacto |
| `db:restore-drill` falla en el control negativo | `controlNegativo.danios` vs `detectadas` | el verificador de digestos dejó de morder | no declarar el respaldo como restaurable hasta arreglar el verificador |
| `verify:rollout` falla con `inputHash` distinto | `.qa/rollout.json` | cambió un archivo de entrada del modelo sin volver a correr el modo sombra | `npm run matching:shadow` y después `verify:rollout` |
| Un quiz nuevo no aparece para quien ya tiene sello | `npm run db:audit` → `05_versionado.sql` | `params_version` del sello es anterior a la versión vigente | es el camino previsto: el aviso de cambios y la re-toma mínima (B9/B10) |
| La retención no purga nada | `docs/DB_ESQUEMA.md`: «Trabajos Cron: no disponible» | `pg_cron` no está instalado y nadie programa `apply_retention_policy` (DB-08) | paso manual M-10; no se resuelve con código |

## 3. Activar y revertir el motor por capas

Las compuertas viven en `data/rollout-gates.json` y **todas** deben pasar para
activar. La activación es una variable de entorno del despliegue más un
recálculo, no una migración y no un comando local. Los dos caminos que sí
existen:

```bash
# 1. el flag vive en el entorno del deploy (NUNCA en un .env local de operación)
vercel env add MATCHING_ENGINE production   # valor: el nombre del motor candidato

# 2. recalcular con ese motor: ruta de consola, logueada, con auditoría
curl -X POST https://<deploy>/api/admin/recompute -H "Authorization: ..."
```

Lo que **no** hace nada de esto: `npm run data:matching` (`scripts/matching/run.mjs
--write`) calibra umbrales y los escribe en `data/matching-config.json`; no toca
la base ni recomputea producción, así que no es el paso 2 (`scripts/matching/run.mjs:4`).

La variable se lee en el composition root (`src/infrastructure/env/env.server.ts:34`)
y se inyecta a `recomputeMatches` (`src/application/recompute-matches.ts:24`);
`resolveEngine()` lanza en vez de adivinar si el nombre está mal escrito
(`src/domain/matching/engine.ts:55`), así que un typo en el flag es un fallo de
deploy visible y no una activación silenciosa. Revertir es quitar la variable y
recalcular: `vercel env rm MATCHING_ENGINE production --yes && vercel redeploy --prod`.
Sin la variable resuelve el motor vigente (`DEFAULT_ENGINE`).

Revertir no borra los avisos ya enviados: lo que se revierte es el cálculo, no la
comunicación. Por eso la activación se hace con las compuertas verdes y no «para
ver qué pasa». Antes de activar hay que aplicar M-13: el recálculo ordinario no
protege las conversaciones mientras la migración
`supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql` siga sin
aplicarse, porque `recomputeMatches` no llama a `conserveProtected` y puede dejar
conversaciones sin par (DB-19). La compuerta `conservacion` mide la salida cruda del
candidato, así que aplicar la migración no la vuelve verde: lo que vuelve cierto es
lo que protege.

El modo sombra (`npm run matching:shadow`) no escribe: calcula el candidato, lo
compara contra el motor en producción y deja el resultado en `.qa/rollout.json`
y `docs/COMPARATIVA_MODELOS.md`. `npm run verify:rollout` lee ese archivo y
rechaza la decisión si el `inputHash` no coincide con la config actual.

## 4. Qué hace cada paso de QA de base

Detalle con números en `docs/QA_DB.md`. Resumen operativo:

| Paso | Dónde corre | Toca producción | Tiempo medido |
|---|---|---|---|
| `db:test` | PGlite en memoria | no | 4.0 s |
| `db:migrate-test` | PGlite + catálogo remoto | sí, lectura de catálogo | 3.8 s |
| `db:audit` | producción si hay credenciales, si no local (`--local` fuerza) | sí, lectura aggregate | 8.3 s |
| `db:drift` | diff contra `supabase/schema-snapshot.json` | sí, lectura | 13.2 s |
| `db:perf` | PGlite con población sintética | no | 19.3 s |
| `db:restore-drill` | PGlite desechable | no | 17.2 s |

Medido como tiempo de pared de `npm run <paso>` en esta máquina (Node 26,
Windows) el 2026-11-10. `npm run verify:all` reimprime sus propios tiempos por
paso y caen en el mismo orden de magnitud. Lo que sostiene el número es el orden
de magnitud, no la cifra: `db:audit` y `db:drift` son los únicos que dependen de
la latencia del proyecto remoto, y el origen que usó queda impreso en
`.qa/db-audit.json` (`origen`, `generatedAt`).

Ninguno deja estado: la base local es PGlite en memoria y renace en cada corrida.

## 5. Escalada

- **Decisión de umbral, de corte o quitar una capa admitida** → se pregunta a la
  persona responsable del proyecto. Es el único caso en que el flujo se detiene
  esperando OK.
- **Datos reales que se ven mal** → se reproduce con población sintética antes de
  tocar nada; los datos reales no son el banco de pruebas.
- **Un paso que no se puede medir** → se registra como OMITIDO con el motivo
  exacto y se anota en `docs/PENDIENTES_MANUALES.md`. Nunca se rellena con una
  estimación.

## 6. Registro

Cada corrida escribe su evidencia en `.qa/` (fuera de git). Si algo falla en
caliente, guardar el archivo correspondiente junto con el reporte del incidente:
es la única forma de que la discusión posterior sea sobre números y no sobre
recuerdos.
