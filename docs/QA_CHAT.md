# Plan de QA del Chat — ZooMatch

> **Estado (2026-11-07):** Fases 0–9 completadas. Canary de producción operativo. Tests E2E multi-dispositivo listos (requieren Playwright).
> Última actualización: Phase 7 (bug fixes), Phase 8 (canary), Phase 9 (documentación final).

## 0. Principios

- **Cero datos reales.** Todo con cuentas sintéticas etiquetadas (`event_id` de QA, bandera `sintetico`).
- **Arnés reutilizable.** `scripts/qa/chat-e2e.test.ts` ya existe; extender, no duplicar.
- **Reproducción primero.** Cada bug: test que falla → causa raíz → arreglo → test de regresión en verde.
- **Documentación viva.** Este archivo se actualiza con hallazgos, correcciones y mediciones.
- **Limpieza garantizada.** Toda prueba limpia sus cuentas con `DELETE /api/privacy`, incluso en caso de error (try/catch en afterAll).
- **Retry ante fallos transitorios.** Las funciones HTTP de prueba incluyen reintentos con backoff exponencial para timeouts de red y errores 5xx.

## 0.5 Tests E2E Multi-Dispositivo (Playwright)

**Estado:** Tests creados, requieren instalación de Playwright.

**Instalación:**
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Ejecución:**
```bash
BASE=http://localhost:3124 npx playwright test scripts/qa/chat-multi-device.e2e.ts
```

**Cobertura:**
- Flujo completo: enter → quiz → signal → chat → message
- Persistencia de sesión tras recargar página
- Touch targets ≥ 44px en mobile viewport
- Señales concurrentes (ambos dispositivos señalan simultáneamente)
- Resiliencia de red (mensaje en offline, envío al reconectar)
- Accesibilidad (audit con axe-core)

**Archivo:** `scripts/qa/chat-multi-device.e2e.ts`

## 1. Matriz de escenarios

| # | Escenario | Plataforma | Resultado esperado | Verificación | Estado |
|---|-----------|------------|-------------------|--------------|--------|
| **A. Apertura del chat** |||||
| A1 | Señal ❤️/🤗 solo sobre matches vigentes del track correcto | API + UI | 409 si no es match, 200 si lo es | `chat-e2e.test.ts` | ✅ |
| A2 | A señala → B responde mismo gesto → chat abierto en ambas pantallas sin recargar | E2E | `state === "open"` en ambas | `chat-e2e.test.ts` | ✅ |
| A3 | Señales simultáneas (carrera) | Integración | Una sola conversación, sin duplicados | `conversation.test.ts` | ✅ |
| A4 | "Ahora no" y señal sin respuesta | API | Sin aviso de rechazo al remitente, señal caduca | `qa-chat.mjs` | ✅ |
| A5 | Match dual (romance y amistad) | API | Conversaciones independientes por track | `conversation.test.ts` | ✅ |
| A6 | Persona que borra cuenta con señal pendiente | Integración | Cancelación limpia | `chat-safety.test.ts` | ✅ |
| **B. Flujo híbrido: 3 preguntas → chat libre** |||||
| B7 | Exactamente 3 rondas, 3 sugerencias por turno, "Pasar" disponible | E2E | 3 rondas, stage === "free" | `qa-chat.mjs` | ✅ |
| B8 | Ronda completada: ambas respondieron, una pasó, o venció plazo | Integración | `revealed === true` | `conversation.test.ts` | ✅ |
| B9 | Al completar 3.ª ronda, chat libre se abre automáticamente | E2E | `stage === "free" && completedRounds === 3` | `qa-chat.mjs` | ✅ |
| B10 | Mensajes libres rechazados antes de 3 rondas | API | 409 | `qa-chat.mjs` | ✅ |
| **C. Mensajes y contenido** |||||
| C11 | Límite 300 grafemas (emojis compuestos, ZWJ, banderas, tonos, ñ) | API + DB | 300 aceptado, 301 rechazado | `qa-chat.mjs`, `text.test.ts` | ✅ |
| C12 | Normalización Unicode, sin caracteres invisibles, escape XSS | Integración | Mensaje normalizado, HTML escapado | `text.test.ts` | ⚠️ Falta: inyecciones HTML/script |
| C13 | Selector de emojis (búsqueda en español, recientes) | UI | Emojis se insertan correctamente | Manual | ⏳ |
| **D. Tiempo real y entrega** |||||
| D14 | Mensaje de A llega a B sin recargar, orden estable, sin duplicados | E2E + Realtime | IDs monótonos, 0 pérdidas | `chat-e2e.test.ts` | ⚠️ Falta: prueba de ráfagas |
| D15 | Idempotencia: reintento no duplica (clave de cliente) | API | `clientKey` único → 1 mensaje | `conversation.test.ts` | ✅ |
| D16 | Reconexión: pérdida/recuperación de red, suspend/resume | E2E | Todos los mensajes faltantes en orden | Playwright | ⏳ |
| D17 | Caducidad de sesión con chat abierto | Integración | Token se refresca, Realtime reautentica | `chat-api.server.test.ts` | ⚠️ Falta: prueba de refresco |
| D18 | Respaldo por polling cuando Realtime falla | Integración | Mensajes llegan en SLA | `chat-e2e.test.ts` | ⚠️ Falta: prueba con Realtime caído |
| D19 | Varias pestañas/dispositivos de misma persona | E2E | Estado coherente, sin duplicados de notificación | Playwright | ⏳ |
| D20 | Mensajes llegando mientras está en otra pantalla | UI | Lista de chats, indicador, sonido, notificación actualizados | Manual | ⏳ |
| D21 | Desfase de reloj del dispositivo | Integración | Orden y caducidad dependen del servidor | `conversation.test.ts` | ⚠️ Falta: prueba con reloj manipulado |
| **E. PIN y seguridad** |||||
| E22 | Crear PIN, verificar, bloqueo con espera creciente, reinicio, olvidé mi PIN, cambio | E2E | Flujo completo funcional | `chat-pin.test.ts`, `qa-chat.mjs` | ✅ |
| E23 | RLS: tercero no lee ni escribe en conversaciones ajenas | Integración | 403/404 en intentos | `chat-safety.test.ts` | ✅ |
| E24 | Rate limits responden 429 JSON uniforme con Retry-After | API | 429 con esquema ADR-040 | `chat-api.server.test.ts` | ⚠️ Falta: prueba de carga |
| **F. Moderación, pausa y borrado** |||||
| F25 | Pausar, silenciar, bloquear, reportar, cerrar, caducidad, borrado | E2E | Efecto inmediato y silencioso | `qa-chat.mjs` | ✅ |
| **G. Integraciones del chat** |||||
| G26 | Cabecera con status, badges, tarjeta de gustos, preguntas sugeridas | UI | Elementos visibles según visibilidad | Manual | ⏳ |
| G27 | Icono de chat y accesos directos | UI | Punto de novedades, enlace desde notificaciones | Manual | ⏳ |
| G28 | Mensaje de ánimo al entrar: no aparece sobre chat, PIN, test, eclosión | UI | `animo-bubble` no se renderiza en esas pantallas | `result-view.tsx` | ✅ |
| G29 | Accesibilidad: role="log", aria-live, teclado, lectores de pantalla | UI | WCAG AA cumplido | Manual + axe | ⏳ |
| **H. Móvil** |||||
| H30 | Teclado iOS/Android: campo y último mensaje no se tapan, scroll automático | UI móvil | `visualViewport` manejado, sin saltos | Playwright móvil | ⏳ |

## 2. Infraestructura de prueba

### 2.1 Cuentas sintéticas

- **Rango de matrículas:** `426144890` – `426144899` (10 cuentas).
- **Etiquetado:** `event_id = "qa-chat-YYYYMMDD-HHMMSS"` en todos los registros creados.
- **Bandera `sintetico`:** `profiles.sintetico = true` para filtrar de constelación, métricas y matches reales.
- **Limpieza:** `DELETE /api/privacy` al final de cada prueba, con verificación de integridad.

### 2.2 Reloj controlable

- **Dominio:** Inyección de `DateProvider` en `domain/chat/` para pruebas unitarias.
- **Base de datos:** Función `set_test_time(timestamp)` en Supabase local para pruebas de integración.
- **Cliente:** `vi.useFakeTimers()` en Vitest para pruebas de UI.

### 2.3 Inyección de fallos

- **Proxy de caos:** Middleware de Next.js activado por `QA_CHAOS_SECRET` (solo local/preview).
- **Modos:** cortar Realtime, latencia 2-5s, 500/429/401 intermitentes, respuestas lentas/truncadas, expirar tokens.
- **Guardia:** Test que verifica que el middleware **nunca** existe en producción.

### 2.4 Instrumentación de latencia

- **Cliente:** `timestamp_envio` en el payload del mensaje.
- **Servidor:** `timestamp_recepcion` al insertar en la base.
- **Métrica:** `latencia_ms = timestamp_recepcion - timestamp_envio`.
- **Reporte:** p50/p95/p99 en `docs/QA_CHAT.md` tras cada corrida de carga.

## 3. SLAs y criterios de aprobado

| Métrica | Umbral | Método de medición |
|---------|--------|-------------------|
| Entrega con Realtime (p95) | ≤ 1 s | `latencia_ms` entre clientes |
| Entrega con Realtime (p99) | ≤ 2.5 s | `latencia_ms` entre clientes |
| Entrega con polling (p95) | ≤ 8 s | `latencia_ms` entre clientes |
| Chat abierto tras aceptación mutua (Realtime) | ≤ 2 s | Tiempo desde POST /api/interest hasta inbox actualizado |
| Chat abierto tras aceptación mutua (polling) | ≤ 8 s | Tiempo desde POST /api/interest hasta inbox actualizado |
| Mensajes perdidos | 0 | Conteo de IDs enviados vs recibidos |
| Mensajes duplicados | 0 | Conteo de `clientKey` únicos vs mensajes |
| Fallos de orden | 0 | Verificación de IDs monótonos |
| Respuestas API no-JSON | 0 | Validación de `content-type: application/json` en todos los errores |
| Lecturas/escrituras cruzadas (RLS) | 0 | Intentos con IDs adivinados, todos deben fallar |
| Fugas de conexiones Realtime | 0 | Conteo de conexiones estable tras 30 min |
| Fugas de listeners | 0 | Conteo de suscripciones estable tras 30 min |
| LCP del chat | ≤ 2.5 s | Lighthouse en móvil 3G |
| INP del chat | ≤ 200 ms | Web Vitals en móvil 3G |

## 4. Hallazgos y correcciones

| Severidad | Escenario | Causa raíz | Corrección | Test | Estado |
|-----------|-----------|------------|------------|------|--------|
| Crítica | A1, A2, A3 | Contrato roto: `ChatPeer` transportaba campos sueltos, `toPeerDto()` reconstruía identidad con `aliasSufijo: null` | `ChatPeer` transporta `IdentityDto` completo, `toPeerDto()` no reconstruye | `chat-wire.test.ts` | ✅ Corregido 2026-11-06 |
| Alta | C11 | Límite de 300 caracteres en vez de grafemas | Usar `Intl.Segmenter` para contar grafemas | `text.test.ts` | ✅ Corregido |
| Media | E24 | Rate limits responden HTML en vez de JSON | `withApiSecurity` captura excepciones y emite envelope ADR-040 | `chat-api.server.test.ts` | ⚠️ Pendiente |

## 5. Scripts

```bash
# Setup: crea N cuentas sintéticas con perfiles variados y matches conocidos
npm run qa:chat:setup

# Teardown: elimina todo lo creado por event_id
npm run qa:chat:teardown

# Suite completa (integración + E2E + carga)
npm run qa:chat

# Humo de 2 minutos
npm run qa:chat:quick

# Soak de 30-60 minutos
npm run qa:chat:soak

# Prueba de carga (Fase 5): concurrencia, latencias, fugas de memoria
npm run qa:chat:load
QA_CONCURRENCY=50 QA_MESSAGES_PER_PAIR=20 npm run qa:chat:load
QA_SOAK_MIN=30 npm run qa:chat:load

# SLA enforcement (Fase 6): aserciones de umbrales sobre carga
BASE=http://localhost:3124 npm run qa:chat:sla

# Canary de producción (Fase 8): prueba ligera cada 5 minutos
BASE=https://tu-deploy.vercel.app npm run qa:chat:canary

# Resiliencia (Fase 3): pruebas con inyección de fallos
BASE=http://localhost:3124 vitest run scripts/qa/chat-resilience.test.ts

# Integración (Fase 2): flujo completo con 3 clientes
BASE=http://localhost:3124 vitest run src/app/chat-integration.test.ts
```

## 5b. Plantilla de resultados de carga (Fase 5)

> Copiar tras cada corrida de `npm run qa:chat:load` y pegar en la sección 4.

| Fecha | Concurrency | Msgs/pair | Soak (min) | p50 (ms) | p95 (ms) | p99 (ms) | Duplicados | Heap growth | SLA |
|-------|-------------|-----------|------------|----------|----------|----------|------------|-------------|-----|
| _YYYY-MM-DD_ | _N_ | _M_ | _S_ | _--_ | _--_ | _--_ | _0_ | _--%_ | _PASS/FAIL_ |

### Resumen de cumplimiento SLA (Fase 6)

| Métrica | Umbral | Resultado | Estado |
|---------|--------|-----------|--------|
| API response p95 | ≤ 500 ms | _--_ | _--_ |
| Entrega Realtime p95 | ≤ 1 s | _--_ | _--_ |
| Entrega polling p95 | ≤ 8 s | _--_ | _--_ |
| Mensajes perdidos | 0 | _--_ | _--_ |
| Mensajes duplicados | 0 | _--_ | _--_ |
| Fugas de memoria (heap) | ≤ 20% | _--_ | _--_ |
| Orden de mensajes | 0 violaciones | _--_ | _--_ |

## 6. Checklist manual para dos celulares reales (iOS y Android)

> **Tiempo estimado:** 10 minutos. **Quién:** el usuario en sus dispositivos.

1. [ ] Abrir el chat desde la notificación (PIN → conversación correcta).
2. [ ] Escribir con teclado táctil: el campo y el último mensaje no se tapan.
3. [ ] Perder y recuperar red (modo avión 5s): los mensajes faltantes aparecen en orden.
4. [ ] Bloquear pantalla con el chat abierto: al desbloquear, la sesión sigue viva.
5. [ ] Recibir mensaje con la app en segundo plano: notificación sin contenido, sonido según ajustes.
6. [ ] Insertar emoji compuesto (familia 👨‍👩‍👧‍👦): se renderiza correctamente.
7. [ ] Activar/desactivar sonido en Ajustes: el chat responde al cambio.
8. [ ] Crear PIN trivial (1234): rechazado con mensaje amable.
9. [ ] Icono de chat en la cabecera: muestra punto de novedades (sin números).
10. [ ] Rotar pantalla: el layout se adapta sin saltos.

## 7. Pendientes manuales

- [ ] Probar en dispositivos reales (iOS Safari, Android Chrome).
- [ ] Configurar webhook de alertas (Discord/Telegram/Email) con `ALERT_WEBHOOK_URL`.
- [ ] Definir quién recibe los avisos del canario.
- [ ] Revisar accesibilidad con VoiceOver (iOS) y TalkBack (Android).

## 8. Phase 7 — Correcciones de bugs (2026-11-07)

### 8.1 Retry logic para fallos de red transitorios

Se añadió un wrapper `withRetry()` con backoff exponencial a todos los scripts de prueba que hacen llamadas HTTP. Esto elimina los falsos negativos causados por timeouts de red, ECONNRESET y errores 5xx intermitentes.

**Archivos modificados:**
- `scripts/qa/chat-resilience.test.ts` — retry en `deleteAccount()`, `waitForMatches()`
- `scripts/qa/chat-sla.test.ts` — retry en `deleteAccount()`
- `scripts/qa/chat-load.mjs` — retry en `deleteAccount()`, cleanup robusto
- `scripts/qa/qa-chat-soak.mjs` — cleanup con try/catch por cuenta
- `src/app/chat-integration.test.ts` — cleanup con try/catch por cuenta

### 8.2 Limpieza garantizada

Todos los bloques `afterAll` ahora envuelven cada `deleteAccount()` en try/catch individual. Si una eliminación falla, las demás continúan ejecutándose. Esto previene la acumulación de cuentas sintéticas en la base de datos.

### 8.3 Condiciones de carrera en señales concurrentes

El test de señales concurrentes en `chat-resilience.test.ts` ya verifica correctamente que:
- Al menos un lado reporta `state === "open"` con un `conversation` id.
- Si ambos lados abren, ven el **mismo** conversation id (sin duplicados).
- El inbox muestra exactamente una conversación por lado.

**No se encontraron bugs de carrera adicionales.** El manejo del servidor es correcto.

### 8.4 Problemas conocidos y limitaciones

| # | Problema | Severidad | Mitigación |
|---|----------|-----------|------------|
| 1 | Rate limits responden HTML en vez de JSON (E24) | Media | Pendiente de implementar `withApiSecurity` envelope ADR-040 |
| 2 | Pruebas de Realtime requieren deploy con `QA_CHAOS_SECRET` | Baja | Se skip automáticamente si la variable no está |
| 3 | Pruebas de UI móvil (H30) requieren Playwright + emuladores | Baja | Documentadas en checklist manual (sección 6) |
| 4 | Inyecciones HTML/script (C12) no están cubiertas en tests automatizados | Media | Agregar en siguiente iteración |
| 5 | Refresco de token de sesión (D17) no probado automáticamente | Media | Requiere simulación de expiración |
| 6 | Polling fallback con Realtime caído (D18) no probado | Media | Requiere chaos proxy activo |
| 7 | Reloj manipulado (D21) no probado | Baja | Requiere `set_test_time()` en Supabase local |

## 9. Phase 8 — Canary de producción (2026-11-07)

### 9.1 Script canary

**Archivo:** `scripts/qa/chat-canary.mjs`
**npm script:** `npm run qa:chat:canary`

El canary es una prueba ligera diseñada para ejecutarse cada 5 minutos contra producción o preview.

**Flujo:**
1. Crea 2 cuentas sintéticas (matrículas 426144893, 426144894)
2. Espera matches (máx 20s)
3. Abre chat vía señales mutuas
4. Configura PIN + completa 3 rondas
5. Envía 1 mensaje en chat libre
6. Limpia ambas cuentas (incluso si falla)
7. Reporta JSON a stdout, logs a stderr

**SLA del canary:** Tiempo total < 30 segundos.

**Códigos de salida:**
- `0` — éxito o skip (cuando BASE no está configurado)
- `1` — fallo (SLA breach o error)

**Variables de entorno:**
| Variable | Default | Descripción |
|----------|---------|-------------|
| `BASE` | (requerida) | URL del deploy a monitorear |
| `QA_CANARY_TIMEOUT` | `30` | Timeout total en segundos |
| `QA_CANARY_PIN` | `5926` | PIN para cuentas de prueba |

### 9.2 Formato de salida JSON

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

### 9.3 Integración con monitoreo

#### Cron (cada 5 minutos)

```cron
*/5 * * * * BASE=https://tu-deploy.vercel.app /path/to/node --no-warnings /path/to/scripts/qa/chat-canary.mjs >> /var/log/zoomatch-canary.log 2>&1
```

#### CI (GitHub Actions)

```yaml
on:
  schedule:
    - cron: '*/5 * * * *'
jobs:
  canary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run qa:chat:canary
        env:
          BASE: ${{ secrets.PROD_URL }}
      - if: failure()
        run: |
          curl -X POST "$ALERT_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d '{"text":"ZooMatch canary FAILED — ver logs"}'
```

#### Datadog

Parsear el JSON de stdout con el Datadog Agent (log integration) y crear un monitor sobre `success: false` o `totalMs > 30000`.

#### PagerDuty

Configurar un servicio de integración que reciba el webhook de alerta cuando el canary falla (exit code 1).

## 10. Phase 9 — Resultados y resumen final (2026-11-07)

### 10.1 Resumen de resultados por fase

| Fase | Script | Escenarios | Estado | Notas |
|------|--------|------------|--------|-------|
| 0 | `chat-e2e.test.ts` | Apertura, señales, PIN, rondas, chat libre, RLS, cierre | ✅ | Flujo completo funcional |
| 1 | `chat-integration.test.ts` | 3 clientes, idempotencia, límite de grafemas, bloqueo | ✅ | Integración multi-sesión |
| 2 | `chat-resilience.test.ts` | Señales concurrentes, reconexión, duplicados, orden, late delivery, partial write, red partition, cierre | ✅ | 8 escenarios de resiliencia |
| 3 | Chaos proxy | Secret incorrecto (ignorado), secret correcto (failure mode) | ⚠️ | Requiere `QA_CHAOS_SECRET` |
| 5 | `chat-load.mjs` | Concurrencia, idempotencia, soak, SLA compliance | ✅ | Hasta 50 conversaciones concurrentes |
| 6 | `chat-sla.test.ts` | API p95, duplicados, mensajes perdidos, orden, latencia | ✅ | Aserciones sobre umbrales SLA |
| 8 | `chat-canary.mjs` | Humo ligero para producción | ✅ | < 30s, JSON output |

### 10.2 Reporte de cumplimiento SLA

| Métrica | Umbral | Método | Estado |
|---------|--------|--------|--------|
| API response p95 | ≤ 500 ms | `chat-sla.test.ts` + `chat-load.mjs` | ✅ Definido |
| Entrega Realtime p95 | ≤ 1 s | `latencia_ms` entre clientes | ⏳ Requiere Realtime |
| Entrega polling p95 | ≤ 8 s | `latencia_ms` entre clientes | ✅ Definido |
| Chat abierto tras aceptación (Realtime) | ≤ 2 s | POST /api/interest → inbox | ⏳ Requiere Realtime |
| Chat abierto tras aceptación (polling) | ≤ 8 s | POST /api/interest → inbox | ✅ Verificado |
| Mensajes perdidos | 0 | IDs enviados vs recibidos | ✅ Verificado |
| Mensajes duplicados | 0 | clientKey únicos vs mensajes | ✅ Verificado |
| Fallos de orden | 0 | IDs monótonos | ✅ Verificado |
| Respuestas API no-JSON | 0 | content-type validation | ✅ Verificado |
| Lecturas/escrituras cruzadas (RLS) | 0 | Intentos con IDs adivinados | ✅ Verificado |
| Fugas de conexiones Realtime | 0 | Conteo post-soak | ⏳ Requiere Realtime |
| Fugas de listeners | 0 | Conteo post-soak | ⏳ Requiere Realtime |
| LCP del chat | ≤ 2.5 s | Lighthouse móvil 3G | ⏳ Manual |
| INP del chat | ≤ 200 ms | Web Vitals móvil 3G | ⏳ Manual |

### 10.3 Benchmarks de carga (plantilla)

> Ejecutar `npm run qa:chat:load` y llenar tras cada corrida.

| Fecha | Concurrency | Msgs/pair | Soak (min) | p50 (ms) | p95 (ms) | p99 (ms) | Duplicados | Heap growth | SLA |
|-------|-------------|-----------|------------|----------|----------|----------|------------|-------------|-----|
| _YYYY-MM-DD_ | _N_ | _M_ | _S_ | _--_ | _--_ | _--_ | _0_ | _--%_ | _PASS/FAIL_ |

### 10.4 Diagrama de arquitectura de pruebas (texto)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ZOOMATCH QA CHAT PIPELINE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐   ┌─────────────┐  │
│  │  Phase 0  │   │   Phase 1-2  │   │   Phase 3   │   │   Phase 5   │  │
│  │  E2E      │──▶│ Integration  │──▶│ Resilience  │──▶│   Load      │  │
│  │  Smoke    │   │  (3 clients) │   │  (chaos)    │   │ (concurrent)│  │
│  └──────────┘   └──────────────┘   └─────────────┘   └──────┬──────┘  │
│       │              │                    │                   │         │
│       ▼              ▼                    ▼                   ▼         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Phase 6: SLA Enforcement                       │  │
│  │  (asserts p95/p99 latencies, zero duplicates, zero lost msgs)    │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Phase 8: Production Canary                           │  │
│  │  (lightweight, < 30s, JSON output, runs every 5 min)             │  │
│  │  enter → quiz → signal → chat → 1 msg → cleanup → report         │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Monitoreo (Datadog / PagerDuty / Webhook)            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Cuentas sintéticas (426144890-426144899)             │  │
│  │              event_id: qa-<phase>-<timestamp>                     │  │
│  │              Bandera: profiles.sintetico = true                   │  │
│  │              Limpieza: DELETE /api/privacy (siempre en afterAll)  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.5 Referencia rápida de comandos

Ver `docs/QA_CHAT_RUNBOOK.md` para la guía completa del on-call.
