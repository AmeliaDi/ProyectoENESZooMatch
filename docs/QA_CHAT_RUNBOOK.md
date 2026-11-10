# Runbook del Chat QA — ZooMatch

> Guia de referencia para ingenieros on-call. Como ejecutar pruebas, interpretar resultados y escalar incidentes.

## 1. Comandos rapidos

### Suite completa

```bash
# Ejecutar TODAS las pruebas de chat (requiere BASE apuntando a un deploy)
BASE=http://localhost:3124 npm run qa:chat

# Solo pruebas unitarias y de esquema (sin deploy, siempre verde offline)
npm run test
npm run check
```

### Pruebas por fase

```bash
# Fase 0: E2E smoke (2 cuentas, flujo completo)
BASE=http://localhost:3124 npm run qa:chat:quick

# Fase 1-2: Integracion (3 clientes, idempotencia, grafemas, RLS)
BASE=http://localhost:3124 vitest run src/app/chat-integration.test.ts

# Fase 3: Resiliencia (concurrencia, reconexion, duplicados, orden, caos)
BASE=http://localhost:3124 vitest run scripts/qa/chat-resilience.test.ts

# Fase 5: Carga (concurrencia, latencias, soak, memoria)
npm run qa:chat:load
QA_CONCURRENCY=50 QA_MESSAGES_PER_PAIR=20 npm run qa:chat:load
QA_SOAK_MIN=30 npm run qa:chat:load

# Fase 6: SLA enforcement (aserciones de umbrales)
BASE=http://localhost:3124 npm run qa:chat:sla

# Fase 8: Canary de produccion (ligero, < 30s)
BASE=https://tu-deploy.vercel.app npm run qa:chat:canary
```

### Setup y teardown de cuentas sinteticas

```bash
# Crear cuentas de prueba
npm run qa:chat:setup
QA_N=4 npm run qa:chat:setup

# Eliminar cuentas de prueba
npm run qa:chat:teardown
QA_MATRICULAS=426144890,426144891 npm run qa:chat:teardown
```

### Soak test (prueba de resistencia prolongada)

```bash
# Soak de 30 minutos (default)
npm run qa:chat:soak

# Soak de 60 minutos
QA_DURATION_MIN=60 npm run qa:chat:soak
```

## 2. Interpretacion de resultados

### Canary (Phase 8)

El canary produce una linea JSON a stdout:

```json
{
  "success": true,
  "totalMs": 12450,
  "steps": {
    "createAccounts": 1200,
    "waitForMatches": 5300,
    "openChat": 800,
    "pinAndRounds": 4500,
    "sendMessage": 650
  },
  "eventId": "qa-canary-2026-11-07T14-30-00",
  "timestamp": "2026-11-07T14:30:12.450Z",
  "error": null
}
```

**Criterios de exito:**
- `success: true` — el flujo completo se completo sin errores.
- `totalMs < 30000` — el tiempo total esta dentro del SLA de 30 segundos.
- `error: null` — no hubo errores.

**Cuando falla:**
- `success: false` con `error` descriptivo — revisar el campo `error` para identificar el paso que fallo.
- `totalMs >= 30000` — el deploy esta lento; revisar latencia de Supabase y cold starts de Vercel.
- `steps.waitForMatches` alto (> 15s) — el algoritmo de matching puede estar tardando; verificar que no haya cuentas sinteticas residuales.

### Carga (Phase 5)

El load test produce un resumen con percentiles de latencia:

```
[Load] Latency p50: 120ms
[Load] Latency p95: 350ms
[Load] Latency p99: 480ms
```

**Umbrales SLA:**
| Metrica | Umbral | Accion si se excede |
|---------|--------|----------------------|
| API response p95 | <= 500 ms | Revisar cold starts, optimizar queries |
| Mensajes duplicados | 0 | Bug critico en idempotencia — escalar |
| Mensajes perdidos | 0 | Bug critico en persistencia — escalar |
| Heap growth (soak) | <= 20% | Fuga de memoria — revisar listeners |

### SLA (Phase 6)

Los tests de SLA fallan con mensajes descriptivos:

```
API p95 must be <= 500ms (got 623ms)
duplicates must be 0 (got 2)
```

Cada fallo indica la metrica, el umbral y el valor observado.

## 3. Troubleshooting

### El canary falla con "BASE not set"

**Causa:** La variable de entorno `BASE` no esta configurada.
**Solucion:** `BASE=https://tu-deploy.vercel.app npm run qa:chat:canary`

### "No mutual match found between canary accounts"

**Causa:** Las cuentas sinteticas no generaron matches. Puede ser porque:
- Ya existen cuentas residuales con las mismas matriculas.
- El algoritmo de matching no ha corrido.
**Solucion:** Ejecutar `npm run qa:chat:teardown` para limpiar, luego reintentar.

### "Timeout: exceeded 30s after waitForMatches"

**Causa:** El deploy es demasiado lento o el matching no esta funcionando.
**Solucion:**
1. Verificar que el deploy esta respondiendo: `curl -s -o /dev/null -w '%{http_code}\n' $BASE/chats`
   (este repo no expone `/api/health`; la pagina de chats es la sonda de vida mas barata
   que no escribe nada)
2. Aumentar el timeout temporalmente: `QA_CANARY_TIMEOUT=60 npm run qa:chat:canary`
3. Revisar logs de Supabase para ver si las queries de matching estan lentas.

### "Chat did not open: state=sent"

**Causa:** La senal mutua no se completo. Una de las cuentas no vio la invitacion.
**Solucion:** Verificar que ambas cuentas tienen matches entre si (revisar `/api/result`).

### Tests de resiliencia fallan con errores de red

**Causa:** El deploy no esta alcanzable o hay un proxy intermedio que corta conexiones.
**Solucion:** Los tests ya incluyen retry logic. Si persiste, verificar conectividad:
```bash
curl -v $BASE/api/enter -X POST -H 'content-type: application/json' -d '{"matricula":"426144890"}'
```

### Cuentas sinteticas residuales

**Causa:** Un test fallo antes de ejecutar la limpieza.
**Solucion:**
```bash
# Eliminar todas las cuentas del rango sintetico
for m in 426144890 426144891 426144892 426144893 426144894 426144895 426144896 426144897 426144898 426144899; do
  QA_MATRICULAS=$m npm run qa:chat:teardown
done
```

### Chaos proxy tests se skippean

**Causa:** `QA_CHAOS_SECRET` no esta configurado en el deploy.
**Solucion:** Esto es esperado en produccion. Los tests de caos solo corren en local/preview con la variable configurada.

## 4. Como agregar nuevos escenarios de prueba

### Agregar un test E2E

1. Abrir `scripts/qa/chat-e2e.test.ts` o `src/app/chat-integration.test.ts`.
2. Agregar un nuevo `it("descripcion del escenario", async () => { ... })`.
3. Usar las cuentas sinteticas del rango 42614489x.
4. Incluir limpieza en `afterAll`.
5. Usar `withRetry()` para llamadas HTTP si el escenario es sensible a fallos transitorios.

### Agregar un test de resiliencia

1. Abrir `scripts/qa/chat-resilience.test.ts`.
2. Crear cuentas fresh dentro del test (no compartir estado entre tests).
3. Registrar matriculas en `createdMatriculas` para limpieza automatica.
4. Usar `openChat()` y `completeRounds()` como helpers.

### Agregar un test de SLA

1. Abrir `scripts/qa/chat-sla.test.ts`.
2. Definir el umbral en el objeto `SLA` al inicio del archivo.
3. Usar `computeStats()` para calcular percentiles.
4. Assert con `expect(value).toBeLessThanOrEqual(SLA.threshold)`.

### Agregar un paso al canary

1. Abrir `scripts/qa/chat-canary.mjs`.
2. Agregar el paso dentro de `runCanary()`, midiendo tiempo con `Date.now()`.
3. Guardar la duracion en `steps[nombreDelPaso]`.
4. Verificar que el timeout global se respeta despues del nuevo paso.

## 5. Como ajustar umbrales SLA

### En tests de SLA (`chat-sla.test.ts`)

Modificar el objeto `SLA` al inicio del archivo:

```typescript
const SLA = {
  realtimeP95: 1000,    // ms — entrega Realtime p95
  realtimeP99: 2500,    // ms — entrega Realtime p99
  pollingP95: 8000,     // ms — entrega polling p95
  apiP95: 500,          // ms — respuesta API p95
  maxLostMessages: 0,   // maximo mensajes perdidos permitidos
  maxDuplicates: 0,     // maximo duplicados permitidos
  maxHeapGrowthPct: 20, // maximo crecimiento de heap en soak
} as const;
```

### En el canary (`chat-canary.mjs`)

El timeout del canary se ajusta con la variable de entorno:

```bash
QA_CANARY_TIMEOUT=45 npm run qa:chat:canary  # 45 segundos en vez de 30
```

O modificar el default en el script:

```javascript
const TIMEOUT_S = Number(process.env.QA_CANARY_TIMEOUT ?? 45); // cambiar default
```

### En el load test (`chat-load.mjs`)

Los umbrales de SLA en el load test estan hardcodeados en la seccion de reporte:

```javascript
// API response time: p95 <= 500ms
const apiP95Ok = sendStats.p95 <= 500;
```

Modificar el valor numerico para ajustar el umbral.

## 6. Escalacion de incidentes

### Nivel 1: Canary falla una vez

- Verificar si es un falso positivo (reintentar manualmente).
- Revisar logs del deploy en Vercel.
- Si persiste, escalar a Nivel 2.

### Nivel 2: Canary falla 2-3 veces consecutivas

- Ejecutar el canary manualmente con mas detalle:
  ```bash
  BASE=https://deploy.vercel.app node --no-warnings scripts/qa/chat-canary.mjs 2>&1
  ```
- Revisar el campo `error` y `steps` para identificar el paso que falla.
- Verificar estado de Supabase (dashboard de salud).
- Si es un problema de infraestructura, notificar al equipo.

### Nivel 3: Tests de SLA fallan

- Ejecutar load test para obtener metricas detalladas:
  ```bash
  BASE=https://deploy.vercel.app npm run qa:chat:load
  ```
- Revisar percentiles de latencia y comparar con baseline.
- Si hay fuga de memoria (`heapGrowthPct > 20%`), ejecutar soak test prolongado.
- Documentar hallazgos en `docs/QA_CHAT.md` seccion 5b.

### Nivel 4: Cuentas sinteticas contaminan produccion

- Ejecutar teardown inmediato:
  ```bash
  QA_MATRICULAS=426144890,426144891,426144892,426144893,426144894,426144895,426144896,426144897,426144898,426144899 npm run qa:chat:teardown
  ```
- Verificar que `profiles.sintetico = true` filtra estas cuentas de resultados reales.
- Investigar causa raiz (test que no limpio, canary interrumpido, etc.).

## 7. Checklist de mantenimiento semanal

- [ ] Ejecutar canary contra produccion y verificar `success: true`.
- [ ] Ejecutar suite completa contra preview mas reciente.
- [ ] Revisar que no hay cuentas sinteticas residuales.
- [ ] Actualizar benchmarks de carga en `docs/QA_CHAT.md` seccion 5b.
- [ ] Verificar que el cron del canary esta corriendo (revisar logs).
- [ ] Revisar alertas de la semana y documentar incidentes resueltos.
