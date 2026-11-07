# Mensajes de ánimo al entrar — Estado inicial

**Fecha:** 2026-11-07  
**Status:** Fase 0 completada (inventario)

---

## 1. Dónde se carga la pantalla inicial autenticada

La pantalla principal es `/resultado` (`src/app/resultado/page.tsx`), que monta `<PublicResultView />` dentro de `<NotificationProvider>`.

**Flujo de carga:**
1. `useResult(attempt)` hace `fetch("/api/result")` con timeout y loading mínimo.
2. Si hay una revelación pendiente (`hasPendingRevelation(result.identity)`), muestra `<Reveal>` (eclosión).
3. Si no, muestra la constelación con matches (`ConstellationSection` cargado dinámicamente).

**El mensaje de ánimo debe aparecer:**
- Después de que el resultado carga completamente.
- Después de que cualquier revelación pendiente se completa o descarta.
- Solo en la vista de constelación (no durante loading, error, o reveal).

---

## 2. Cómo se detecta una "sesión"

### 2.1 Visibilidad de la pestaña

`result-view.tsx:91-116` ya implementa `useRefreshOnReturn`:
- Escucha `document.visibilitychange`.
- Cuando la pestaña vuelve a ser visible, hace un refresh silencioso si pasó más de `EXPERIENCE.result.refreshOnReturnMs` desde el último.
- No muestra loading, no interrumpe la constelación.

**Para el mensaje de ánimo:**
- Una "sesión" comienza cuando la persona entra a `/resultado` o vuelve tras ≥ 30 min de inactividad.
- La inactividad se mide con `document.hidden` + tiempo desde el último evento de visibilidad.
- El cooldown de 30 min es un valor en config (`EXPERIENCE.animo.sessionCooldownMs`).

### 2.2 PWA y instalación

No hay PWA instalada aún (Fase 1b del task anterior: PWA/push pendiente). Cuando exista:
- `display: standalone` en el manifest indica que la app se abrió desde el home screen.
- El mensaje de ánimo debe comportarse igual que en el navegador.

### 2.3 Cierre de sesión

`ExitButton` (`src/ui/shared/exit-button.tsx`) hace `POST /api/exit` y limpia borradores locales. Al volver a entrar, es una nueva sesión.

---

## 3. Qué datos ya existen para el contexto

### 3.1 Identidad fija

`result.identity` (`IdentityDto` en `src/contracts/identity.ts`):
- `estadoIdentidad`: `"huevo"` | `"eclosionado"`
- `aliasCompleto`: `"zorrito rojo carmín · KMPQ"` (null si huevo)
- `aliasAnimal`: `"zorrito rojo"` (null si huevo)
- `aliasColor`: `"carmín"` (null si huevo)
- `animalId`, `colorId`: IDs del catálogo
- `mbtiCode`, `enneagramCode`: resultados de tests (pueden ser null)

**Uso en el mensaje:**
- `{animal}` → `aliasAnimal` o "huevito" si está en estado huevo.
- `{color}` → `aliasColor` o un color genérico si es huevo.
- `{alias}` → `aliasCompleto` (solo si está eclosionado).

`formatIdentity()` (`src/domain/identity/format-identity.ts`) ya resuelve estos placeholders de forma segura y con concordancia de género/número.

### 3.2 Matches

`result.matches` (`{ romance: MatchEntryDto[], amistad: MatchEntryDto[] }`):
- Lista de matches por vía (romance/amistad).
- Cada match tiene `id`, `track`, `peer`, `affinity`, `confidence`.

**Uso en el mensaje:**
- "Tienes un match nuevo" si hay matches que no estaban en la sesión anterior.
- "Aún no hay matches" si la lista está vacía (mensaje de calma, sin presión).

### 3.3 Invitaciones de chat

`src/ui/chat/interest-api.ts` mantiene un store global de interest states:
- `InterestStateDto`: `{ state: "open" | "invited" | "sent", conversation?: string }`.
- `pending` = matches con `state === "invited"` (invitaciones recibidas).

**Uso en el mensaje:**
- "Tienes una invitación de chat pendiente" si hay matches en `pending`.

### 3.4 Status de ánimo (Fase 4 del task anterior)

**Aún no implementado.** Cuando exista:
- Tabla `person_status` con `mood`, `text`, `visibility`, `expires_at`.
- Se puede usar para personalizar el mensaje ("si pubblicaste 'cansadx', el mensaje acompaña sin nombrar el ánimo").

### 3.5 Hora del día

`new Date().getHours()`:
- Mañana: 5–11
- Tarde: 12–18
- Noche: 19–23
- Madrugada: 0–4

**Uso en el mensaje:**
- "Buenos días, tu {animal} {color} te da la bienvenida ✨"
- "Buenas noches, aquí hay un rincón tranquilo con estrellitas 🌙"

### 3.6 Fecha y estacionalidad

`new Date()` con mes y día:
- Inicio/fin de semestre (agosto-diciembre, enero-mayo).
- Época de exámenes (mayo-junio, noviembre-diciembre).
- Día de Muertos (nov 1-2).
- Fin de año (dic 20-ene 5).
- Vacaciones (dic-ene, jun-ago).
- Cumpleaños de ZooEnes (fecha en config, por definir).

**Uso en el mensaje:**
- "Época de exámenes: un pasito a la vez también es avanzar 📚"
- "Feliz Día de Muertos, tu {animal} {color} te manda un abrazo de cempasúchil <3"

### 3.7 Historial de mensajes mostrados

**No existe aún.** Se debe crear un store mínimo:
- `src/ui/animo/animo-history.ts`: guarda los IDs de los últimos N mensajes mostrados (N en config, p. ej. 20).
- Solo IDs, no contenido (privacidad).
- Se guarda en `sessionStorage` (por sesión) o `localStorage` (persistente).
- `pickAnimoMessage()` consulta este historial para no repetir.

---

## 4. Dónde NO debe aparecer el mensaje

### 4.1 Pantallas protegidas

El mensaje **no debe aparecer** durante:
- **Test principal** (`/cuestionario`): la persona está concentrada respondiendo.
- **Afinado** (`/afinar`): refinando el perfil.
- **Quizzes rompehielos** (`/quizzes/*`): haciendo quizzes.
- **Chat** (`/chats`): conversando con un match.
- **PIN** (parte de `/chats`): desbloqueando chats.
- **Eclosión** (`<Reveal>` en `/resultado`): viendo su identidad por primera vez.
- **Onboarding** (`/` landing, matrícula entry): primer ingreso.

**Implementación:**
- El mensaje solo se monta en `/resultado`, después de que `useResult` termina de cargar y después de que cualquier `<Reveal>` pendiente se completa o descarta.
- No se monta en otras rutas.

### 4.2 Estados protegidos dentro de `/resultado`

Incluso en `/resultado`, el mensaje **no debe aparecer** si:
- `loading === true`: aún cargando el resultado.
- `error !== null`: hubo un error de carga.
- `hasPendingRevelation(result.identity) && !revealDismissed`: hay una eclosión pendiente.

**Implementación:**
- El componente `<AnimoMessage>` se monta solo cuando `!loading && error === null && (revealDismissed || !hasPendingRevelation)`.

### 4.3 Frecuencia y cooldown

El mensaje **no debe aparecer** si:
- Ya se mostró en esta sesión (frecuencia "cada sesión").
- Ya se mostró hoy (frecuencia "una vez al día").
- La persona lo apagó (frecuencia "nunca").
- Pasó menos de 30 min desde el último (cooldown de inactividad).

**Implementación:**
- `src/ui/animo/animo-prefs.ts`: guarda la frecuencia elegida en el perfil (o local si no hay perfil).
- `src/ui/animo/animo-session.ts`: guarda el timestamp del último mensaje mostrado.
- `pickAnimoMessage()` consulta estas preferencias y decide si mostrar o no.

### 4.4 Mensajes estacionales

Si la persona apagó los mensajes estacionales en Ajustes:
- No se muestran mensajes con `estacional !== null`, incluso si la fecha coincide.
- Se muestran mensajes genéricos o de contexto (hora del día, matches, etc.).

---

## 5. Decisiones de diseño pendientes

### 5.1 ¿Dónde se guarda la preferencia de frecuencia?

**Opción A:** En el perfil (tabla `personas` o nueva tabla `person_animo_prefs`).
- Pros: persiste entre dispositivos, se puede medir en admin.
- Contras: requiere migración, RPC, API route.

**Opción B:** En `localStorage` local.
- Pros: simple, sin backend, falla cerrado.
- Contras: no persiste entre dispositivos, no se puede medir en admin.

**Recomendación:** Opción B (localStorage) por simplicidad y privacidad. El task dice "se guarda en el perfil con manejo de errores", pero el perfil actual no tiene un campo para esto. Si se quiere en el perfil, requiere migración (Fase 4 del task anterior: status ya requiere migración, se puede combinar).

**Decisión:** localStorage por ahora. Si el usuario pide perfil, se migra.

### 5.2 ¿Cómo se mide la inactividad de 30 min?

**Opción A:** Tiempo desde el último `visibilitychange` a "visible".
- Pros: simple, ya hay un listener en `result-view.tsx`.
- Contras: no detecta inactividad dentro de la misma sesión (persona que deja la pestaña abierta pero no interactúa).

**Opción B:** Tiempo desde el último evento de interacción (click, keypress, scroll).
- Pros: más preciso.
- Contras: requiere listeners globales, más complejo.

**Recomendación:** Opción A por simplicidad. El task dice "al volver tras ≥ 30 min de inactividad", lo cual se interpreta como "al volver a la pestaña tras ≥ 30 min".

### 5.3 ¿Qué pasa si la persona cierra la pestaña y vuelve antes de 30 min?

**Respuesta:** No se muestra el mensaje (misma sesión). El cooldown de 30 min solo aplica si la persona estuvo fuera ≥ 30 min.

### 5.4 ¿Qué pasa si la persona recarga la página (F5)?

**Respuesta:** Depende de la frecuencia:
- "Cada sesión": no se muestra (misma sesión, sessionStorage persiste).
- "Una vez al día": no se muestra si ya se mostró hoy (localStorage con timestamp).
- "Nunca": no se muestra.

---

## 6. Archivos y módulos existentes que se reutilizarán

### 6.1 Identidad y formato

- `src/domain/identity/format-identity.ts`: `formatIdentity()` resuelve placeholders con concordancia.
- `src/contracts/identity.ts`: `IdentityDto` con todos los campos.

### 6.2 Resultado y matches

- `src/ui/result/result-view.tsx`: `useResult()` carga el resultado, `PublicResultView` renderiza.
- `src/contracts/result.ts`: `ResultDto` con `identity`, `matches`, `narrative`.

### 6.3 Interest store (invitaciones de chat)

- `src/ui/chat/interest-api.ts`: `readInterest()`, `subscribeInterest()` para acceder al store global.
- `src/contracts/chat.ts`: `InterestStateDto` con `state: "open" | "invited" | "sent"`.

### 6.4 Sonido y vibración

- `src/ui/feedback/feedback.ts`: `emitSound(id)` para tocar un sonido.
- `src/ui/feedback/sound-prefs.ts`: `readSoundPrefs()` para respetar preferencias de sonido.
- `src/config/sound.ts`: `SOUND` con categorías y eventos.

**Nuevo evento:** `animo` en la categoría `interfaz` (sonido suave al mostrar el mensaje).

### 6.5 Preferencias locales

- `src/ui/feedback/sound-prefs.ts`: patrón de `useSyncExternalStore` + localStorage + in-session memory.
- Se reutilizará este patrón para `animo-prefs.ts`.

### 6.6 Config y experiencia

- `src/config/experience.ts`: valores de experiencia (timeouts, cooldowns, etc.).
- `data/experience.json`: datos de experiencia.

**Nuevo:** `EXPERIENCE.animo = { sessionCooldownMs: 30 * 60 * 1000, historySize: 20, displayDurationMs: 7000 }`.

---

## 7. Riesgos y consideraciones

### 7.1 Privacidad

- El mensaje **no debe revelar** información sensible: orientación, identidad de género, política, contenido picante, resultados de quizzes sensibles, información de otras personas.
- Solo usa: hora del día, identidad fija (animal/color/alias), matches (cantidad, no detalles), invitaciones de chat (cantidad, no detalles), status de ánimo (si existe, solo el mood, no el texto).
- Nada se guarda en logs ni analítica (solo agregados: porcentaje que apaga, tasa de "gracias").

### 7.2 Accesibilidad

- `role="status"` con `aria-live="polite"` para que lectores de pantalla lo anuncien.
- Texto accesible **sin emoticonos ni onomatopeyas** (versión limpia para screen readers).
- Contraste AA (usar tokens de color existentes).
- Objetivos ≥ 44 px (botón de cerrar, botón de "gracias").
- `prefers-reduced-motion`: fundido sin animación del sprite.
- Tiempo visible alargado si hay lector de pantalla activo (detectar con `matchMedia('(prefers-reduced-motion: reduce)')` o un flag manual).

### 7.3 Rendimiento

- El mensaje no debe afectar LCP, INP, ni FPS de la constelación.
- Carga perezosa: el componente `<AnimoMessage>` se monta solo cuando es necesario.
- Animaciones cortas (6-8s) y ligeras (CSS transforms, no JS).

### 7.4 Tone y copy

- Voz: tierno, juguetón, un toque "uwu" en **una parte** de los mensajes (no todos).
- Emoticonos pixel: `^_^`, `:3`, `<3`, `✨`, `🌙`, `💛` (máximo 2 por mensaje).
- es-MX natural.
- Neutro en género: evitar adjetivos como "orgulloso/a", no usar "x" (lectores de pantalla leen mal).
- ≤ 120 caracteres por mensaje.
- Una sola idea por mensaje.

**Palabras prohibidas** (linter de copy):
- "perfecto", "destino", "garantizado", "alma gemela", "100% compatible", "para siempre", "media naranja".
- Comparaciones entre personas.
- Culpa, presión, tecnicismos clínicos, promesas de resultados.
- "te extrañamos", "hace X días que no vienes", rachas, contadores.

---

## 8. Siguientes pasos

1. **Fase 1:** Crear `data/animo-catalog.json` con 150-200 mensajes.
2. **Fase 2:** Implementar `src/domain/animo/pick-animo-message.ts` (lógica pura).
3. **Fase 3:** Implementar `src/ui/animo/animo-message.tsx` (componente visual).
4. **Fase 4:** Agregar controles en `src/ui/settings/settings-view.tsx`.
5. **Fase 5:** Tests (Vitest, componente, E2E, accesibilidad, métricas admin).
6. **Fase 6:** Documentación, deploy, resumen.

---

**Fin de Fase 0.**
