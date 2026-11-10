# Comparativa de motores de matching

> Archivo generado por `node scripts/matching/run-shadow.mjs`. No editar a mano.
> Evidencia sintética y reproducible: no contiene datos de producción.

Semilla 1515870810, N=600, hash de entradas `0286ee2c6e42d504`, corrida 26.3 s, generada 2026-11-10T07:10:51.311Z (la hora vive también en `.qa/rollout.json`; lo reproducible es el hash de entradas, no la marca de tiempo).

## Decisión

**NO ACTIVAR. Se mantiene `capas`.** Fallan 2 de 9 compuertas: `correlacion_rangos`, `conservacion`.

Las compuertas son una conjunción: no hay puntaje ponderado ni override. Una sola que falle bloquea la activación y el motivo queda registrado abajo.

## Motores comparados

- **`capas` (vigente):** soft-min por capas sobre las posterioriales latentes, consciente de la incertidumbre (SE), cortado en el cuantil calibrado de la nula por permutación. Es el que la app usa hoy.
- **`coseno` (candidato, en sombra):** coseno no centrado de los vectores descriptivos [0, 1] del track. Es la idea del motor anterior, conservada seleccionable ÚNICAMENTE para que la corrida sombra tenga una alternativa real que juzgar. Ignora la incertidumbre, los pisos y el soft-min.

Ambos comparten filtros duros, el corte calibrado, top-K, orden canónico y deduplicación (`computeWith`), así que la comparación aísla la regla de puntaje y nada más. El candidato se calcula y se almacena como agregado interno; **no se muestra a nadie**.

## Mediciones por track

| Métrica | Vigente (capas) | Candidato (coseno) | Compuerta |
|---|---|---|---|
| romance · cobertura (pool) | 73.7 % | 100.0 % | entre 65.0 % y 100.0 % |
| romance · Gini de exposición | 0.5882 | 0.3843 | ≤ 0.6500 y ≤ el vigente |
| romance · equidad (mín/mediana) | 0.7544 | 1.0000 | ≥ 0.70 |
| romance · ρ de rangos vs vigente | 1.0000 | 0.2724 | ≥ 0.80 |
| romance · ρ bajo ruido | 0.9665 | 0.9758 | ≥ 0.90 |
| romance · Jaccard bajo ruido | 0.5241 | 0.5784 | ≥ 0.45 |
| amistad · cobertura (pool) | 99.8 % | 100.0 % | entre 95.0 % y 100.0 % |
| amistad · Gini de exposición | 0.3132 | 0.2080 | ≤ 0.4000 y ≤ el vigente |
| amistad · equidad (mín/mediana) | 0.9867 | 1.0000 | ≥ 0.70 |
| amistad · ρ de rangos vs vigente | 1.0000 | 0.3872 | ≥ 0.80 |
| amistad · ρ bajo ruido | 0.9681 | 0.9560 | ≥ 0.90 |
| amistad · Jaccard bajo ruido | 0.5154 | 0.4946 | ≥ 0.45 |

Tiempo de cómputo: vigente 5429 ms, candidato 578 ms sobre 207400 pares evaluados (2.79 ms por mil pares; presupuesto 40.45 ms).

Violaciones estructurales (simetría, orden canónico, duplicados, auto-match, rango): vigente 0, candidato 0.

## Compuertas

| Id | Compuerta | Observado | Requerido | Estado |
|---|---|---|---|---|
| cobertura.romance | Cobertura de romance (pool que el track atiende por diseño) | 100.0 % | entre 65.0 % y 100.0 % | PASA |
| cobertura.amistad | Cobertura de amistad (pool que el track atiende por diseño) | 100.0 % | entre 95.0 % y 100.0 % | PASA |
| equidad | Cobertura mínima (pool) / mediana por subpoblación | 1.0000 (romance) | ≥ 0.70 | PASA |
| exposicion | Gini de exposición (reparto de visibilidad, no deseabilidad) | 0.3843 (romance) | ≤ 0.5882 | PASA |
| correlacion_rangos | Correlación de rangos con el motor vigente (cambio gradual) | ρ = 0.2724 (romance) | ρ ≥ 0.80 | FALLA |
| estabilidad_ruido | Estabilidad ante ruido de respuesta (±1 Likert) | ρ = 0.9560, Jaccard = 0.4946 | ρ ≥ 0.90 y Jaccard ≥ 0.45 | PASA |
| invariantes | Violaciones estructurales (simetría, orden, duplicados, rango) | 0 | ≤ 0 | PASA |
| tiempo | Tiempo de cómputo por mil pares evaluados | 2.79 ms | ≤ 40.45 ms | PASA |
| conservacion | Matches con conversación abierta que se perderían | 578 | ≤ 0 | FALLA |

## Motivos por los que no se activa

- **`correlacion_rangos`** — El reordenamiento de romance (ρ = 0.2724) es demasiado abrupto respecto al motor vigente; cambiaría la constelación de golpe.
- **`conservacion`** — El candidato eliminaría 578 matches que ya tienen una conversación abierta. Una conversación existente nunca se rompe por un cambio de motor.

### Recomendación

Mantener `capas`. El candidato no debe activarse mientras falle alguna compuerta; relajar un umbral para que pase está prohibido por el prompt de afinación y por `data/rollout-gates.json`. Si se quiere un motor distinto, hay que cambiar la regla de puntaje y volver a medir, no bajar la vara.

## Conservación de conversaciones abiertas

Parejas protegidas en esta corrida: **664** (origen: **sintetico**, muestra sembrada de lo que publica el vigente). El candidato perdería **578** si se reemplazara el conjunto tal cual; la compuerta exige 0.

**Esto es una garantía estructural, no una esperanza:** `public.conversations` y `public.chat_interests` referencian solo `public.profiles`, nunca `public.matches` (`supabase/migrations/00000000000000_base.sql`). `replace_matches` hace `DELETE FROM public.matches WHERE true` bajo un advisory lock y un guard de versión de pool, pero no puede cascadear hacia una conversación. Aun así, la activación no reemplaza a ciegas: `conserveProtected(next, protectedPairs)` vuelve a publicar toda pareja protegida que el motor nuevo no produzca, con su similitud ya almacenada, y es idempotente.

**Esa garantía hoy solo cubre la activación, no el recálculo ordinario — y hay remedio preparado.** `recomputeMatches` (`src/application/recompute-matches.ts:36-51`) calcula y llama `replaceAll` sin leer las parejas protegidas, así que el camino que recorre `POST /api/admin/recompute` puede dejar conversaciones sin par. Medido en producción: 71 conversaciones sin par vigente, 5 abiertas después del último recálculo. Es el hallazgo DB-19 de `docs/QA_DB.md` y el paso M-13 de `docs/PENDIENTES_MANUALES.md`. La salida está escrita y probada en `supabase/maintenance/pending/20261127000000_conservar_conversaciones.sql`: `replace_matches` toma el snapshot de las parejas con conversación abierta **antes** de su propio `DELETE` y las regresa con la similitud, los badges y el `computed_at` del renglón previo. Pasa por alto la aplicación porque el recálculo vive en el camino caliente de cada envío de quiz. Mientras la migración siga en `pending/`, la compuerta `conservacion` describe el comportamiento de la activación, no del recálculo ordinario; y aplicarla no vuelve verde la compuerta por sí sola, porque `conservationLoss` mide la salida cruda del candidato (`src/domain/matching/rollout.ts:43`) — lo que cambia es que el escrito real ya no puede dejar conversación sin tarjeta. Prueba: `supabase/tests/05_conservacion.sql` (15 aserciones, con la directiva `-- @aplicar` que inyecta la migración dentro de la propia transacción). Decisión: ADR-061.

Antes de activar contra producción hay que extraer el conjunto REAL de parejas con conversación abierta con `supabase/maintenance/protected-pairs.sql` (solo lectura, agregado y digest) y volver a correr la compuerta. Medido en producción el 2026-11-10: **122 pares protegidos** (88 de amistad, 34 de romance), 58 con al menos un mensaje escrito, digest `bb5d73b21bc77494072e2ffd5cac1173`; y en el espejo, 71 conversaciones cuyo par ya no está en `matches` (hallazgo DB-19 en `docs/QA_DB.md`). Esta corrida usa un conjunto sembrado porque el acceso disponible es de agregados y no se inventan datos: el archivo devuelve conteos y la huella del conjunto, no la lista.

## Activación (solo si todas las compuertas pasan)

1. Extraer las parejas protegidas reales (SQL de solo lectura arriba) y volver a correr `node scripts/matching/run-shadow.mjs` con ese conjunto.
2. Respaldar antes de tocar nada: `node --no-warnings scripts/db-backup.mts --out .backups/pre-rollout`.
3. Aplicar la migración del tipo de notificación. Está preparada y probada sobre la base local en `supabase/maintenance/pending/20261126000000_afinidad_notification.sql`, y NO se ejecuta en producción por un agente: mientras vive en `pending/` no forma parte del esquema del repo porque `npm run db:migrate-test` exige que las migraciones repliquen producción sin diferencias, y esta agrega 1 índice y ensancha 1 CHECK. Para aplicarla: mover el archivo a `supabase/migrations/`, correr `npm run db:schema` para refrescar la línea base, voltear la aserción de `supabase/tests/01_esquema.sql` que hoy exige que `afinidad_afinada` se rechace, y entonces `node scripts/db-apply.mjs --migration supabase/migrations/20261126000000_afinidad_notification.sql`.
4. Activar el flag: `MATCHING_ENGINE=coseno` en el entorno del deploy (el nombre lo fija `data/rollout-gates.json → activacion.variable`).
5. Recalcular de forma idempotente conservando las parejas protegidas (`conserveProtected`), y enviar UNA sola notificación por persona del tipo `afinidad_afinada`: «Afinamos tu afinidad — revisa tus matches». Sin spam, sin cambios abruptos de constelación.

## Rollback (un solo comando, en ambos casos)

```bash
# Quita la variable del entorno del deploy y recalcula con el motor vigente:
vercel env rm MATCHING_ENGINE production --yes && vercel redeploy --prod
```

Sin la variable, `getMatchingEngine()` resuelve a `capas` (`DEFAULT_ENGINE`). Un valor desconocido lanza en el arranque en vez de elegir un motor en silencio, así que un typo en el flag es un bug de deploy visible, no una activación accidental. El recálculo es idempotente y las conversaciones abiertas nunca se tocan.

## Trazabilidad

- Umbrales: `data/rollout-gates.json` (cada número con `{valor, etiqueta, fuente}`).
- Compuertas: `src/domain/matching/rollout.ts`, pruebas `src/domain/matching/rollout.test.ts`.
- Motores: `src/domain/matching/engine.ts`, pruebas `src/domain/matching/engine.test.ts`.
- Corrida sombra: `scripts/matching/shadow.ts`, agregados en `.qa/rollout.json`.
- Línea base del vigente: `docs/MATCHING_RESULTADOS.md`.
