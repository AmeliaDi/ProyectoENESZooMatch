# Quizzes rompehielos: Gustos, Gaming y Picante (18+)

> **Estado (2026-11-06):** diseño aprobado, en implementación.

## 1. Qué son y qué no son

Los **quizzes rompehielos** son una sección opcional de ZooMatch con tres sets cortos y lindos
que sirven para **romper el hielo** en las conversaciones:

1. **Gustos** — música, cine, anime, libros, comida, viajes, estilo.
2. **Gaming** — plataformas, géneros, estilo de juego, juegos de mesa.
3. **Picante (18+)** — coqueteo, ritmo, límites, curiosidad adulta (voluntario, con candado).

### 1.1 Principios no negociables

| # | Principio | Cómo se aplica |
|---|---|---|
| 1 | **No alteran el modelo psicométrico** | No entran al puntaje de compatibilidad, ni a los pesos, ni a las explicaciones del match, ni al color/animal/alias. Son una capa aparte etiquetada como "para divertirse". |
| 2 | **Privado por defecto** | Cada quiz tiene su visibilidad: `privado` (default) \| `compartir_coincidencias_con_matches`. Nadie ve respuestas crudas; solo se calculan coincidencias en el servidor cuando **ambas** lo activan. |
| 3 | **Sin presión** | Nunca se muestran los "no" ni las omisiones. Todo quiz tiene "prefiero no decir" y se puede saltar o borrar. |
| 4 | **Solo personas eclosionadas** | Con identidad completa (huevo → eclosión) ven los quizzes y entran a las coincidencias. |
| 5 | **Tono afectivo** | Conciso, amable, juguetón; es-MX; accesible; sin "x" en textos que lean mal los lectores de pantalla. |

## 2. Flujo de usuario

### 2.1 Acceso

1. Desde la navegación principal (icono de quizzes junto al chat), solo visible para personas
   eclosionadas.
2. Pantalla **Quizzes** con tres tarjetas ilustradas en pixel art (nota musical, mando, llama).
3. Cada tarjeta muestra progreso (estrellas) y estado (no iniciado / en progreso / completado).
4. La tarjeta "Picante" solo existe para quien cumple los requisitos (§6).

### 2.2 Mecánica de un quiz

1. Se entra a un quiz → primera pantalla: propósito, duración estimada (< 2 min), opción de
   salir.
2. Una tarjeta por pantalla, opciones grandes tocables (≥ 44 px), gesto de avance suave.
3. Barra de progreso en constelación (reutiliza el cielo).
4. "Saltar" y "prefiero no decir" siempre a la vista.
5. Al completar: ficha con resultado amable ("Tu vibra musical: ..."), badges motivacionales, y
   opción de **compartir coincidencias con matches** (apagada por defecto, con explicación breve).

### 2.3 Coincidencias

1. En el panel del match y en el chat, si **ambas** activaron la visibilidad del quiz, aparece
   "gustos en común" o "coincidencias para jugar".
2. Solo se muestran los elementos donde coinciden, nunca las respuestas individuales ni los "no".
3. Las coincidencias generan **preguntas sugeridas** que se añaden al banco de preguntas guiadas
   del chat (categoría opcional "rompehielos").
4. Para Picante, las coincidencias aparecen **solo dentro de la conversación abierta** como tarjeta
   privada, con botón para ocultarla (§6.5).

## 3. Modelo de datos

### 3.1 Definiciones de quizzes

Viven en `data/quizzes/*.json`, validados con esquemas Zod:

- `gustos.json` — 4–6 mini-quizzes (música, cine, anime, libros, comida, viajes, estilo).
- `gaming.json` — 3–4 mini-quizzes (plataformas, géneros, estilo, juegos de mesa).
- `picante.json` — 2 niveles (coqueto, curiosidad adulta), cada uno con su confirmación.

Cada quiz tiene:
- `quiz_id` — identificador único (ej: `gustos_musica`, `gaming_plataformas`, `picante_nivel1`).
- `revision` — versión del contenido (ej: `1`). Si cambia el contenido, se incrementa.
- `categoria` — agrupación (gustos, gaming, picante).
- `nivel` — para Picante: 1 (coqueto) o 2 (curiosidad adulta).
- `item_id` — identificador del ítem dentro del quiz.
- `texto` — pregunta o enunciado.
- `opciones` — lista curada de opciones (sin texto libre).
- `multiple` — booleano: selección única o múltiple.
- `dimensiones_relacionadas` — para generar preguntas sugeridas en el chat.

**Evitar duplicados con el banco de preguntas del chat:** los quizzes no repiten las preguntas de
`chat-prompts.json`. Si un quiz toca un tema similar (ej: música), la pregunta sugerida derivada de
la coincidencia es distinta a las del banco.

### 3.2 Respuestas de usuario

Tablas nuevas en la base:

```sql
-- Intento de quiz (una fila por persona por quiz completado)
CREATE TABLE quiz_attempts (
  persona_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  completado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (persona_id, quiz_id)
);

-- Respuestas individuales (una fila por ítem respondido)
CREATE TABLE quiz_answers (
  persona_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  valor TEXT NOT NULL, -- opción seleccionada o JSON array para múltiple
  PRIMARY KEY (persona_id, quiz_id, item_id)
);

-- Visibilidad por quiz (nivel de compartir)
CREATE TABLE quiz_sharing (
  persona_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  nivel_visibilidad TEXT NOT NULL DEFAULT 'privado', -- 'privado' | 'compartir_coincidencias_con_matches'
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (persona_id, quiz_id)
);
```

### 3.3 Picante: consentimiento y mayoría de edad

```sql
-- Consentimiento para Picante (una fila por persona que lo aceptó)
CREATE TABLE quiz_picante_consent (
  persona_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  mayor_de_edad BOOLEAN NOT NULL, -- autodeclaración, no verificada
  consentimiento_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  track_romance_activo BOOLEAN NOT NULL DEFAULT false -- copia de la preferencia de track
);
```

**Nota honesta:** la edad es autodeclarada, no verificada. El sistema confía en la declaración.
Documentar esto en el consentimiento y en `docs/PRIVACIDAD.md`.

### 3.4 Coincidencias calculadas

No se guardan en la base. Se calculan en tiempo real por la RPC `quiz_coincidencias` (§4.2) cuando
ambas personas tienen visibilidad activada.

## 4. Servidor

### 4.1 RLS y permisos

Todas las tablas nuevas tienen:
- RLS activado.
- Sin políticas para `anon` ni `authenticated` (el servidor lee con `service_role`).
- `REVOKE` a `anon`/`authenticated`.
- `GRANT` solo a `service_role`.
- `ON DELETE CASCADE` desde `profiles`.

### 4.2 RPC de coincidencias

```sql
CREATE OR REPLACE FUNCTION quiz_coincidencias(
  yo UUID,
  otra_persona UUID,
  quiz_id TEXT
)
RETURNS TABLE (item_id TEXT, valor TEXT)
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Verifica que ambas tengan visibilidad activada para este quiz
  -- Verifica que haya match vigente entre yo y otra_persona
  -- Devuelve solo los ítems donde ambas respondieron lo mismo
  -- Nunca devuelve respuestas individuales ni "no" ni omisiones
$$;
```

**Guardias:**
1. Ambas deben tener `quiz_sharing.nivel_visibilidad = 'compartir_coincidencias_con_matches'` para
   este `quiz_id`.
2. Debe existir un match vigente entre `yo` y `otra_persona` (en `matches`, sin filtro de track
   para Gustos/Gaming; solo romance para Picante).
3. Solo devuelve ítems donde **ambas** respondieron **Sí** o **Tal vez** (para Picante) o la misma
   opción (para Gustos/Gaming).
4. Nunca devuelve respuestas individuales, "no", ni omisiones.

### 4.3 Borrado

Cada persona puede:
- Borrar los resultados de un quiz específico (`DELETE FROM quiz_answers WHERE persona_id = ... AND quiz_id = ...`).
- Borrar todos los quizzes (`DELETE FROM quiz_answers WHERE persona_id = ...`).
- Al eliminar la cuenta, se borra todo (CASCADE desde `profiles`).

El borrado tiene efecto inmediato: las coincidencias desaparecen al instante.

### 4.4 Rate limit y seguridad

Todas las rutas de quizzes usan `withApiSecurity` y el rate limit existente. Las respuestas son
JSON uniforme con errores específicos y amables.

## 5. Set "Gustos" (música, películas y más)

### 5.1 Mini-quizzes

4–6 quizzes de 8–10 ítems, < 2 minutos cada uno:

1. **Música** — géneros, épocas, cómo se escucha (conciertos vs audífonos), playlist de estudio,
   comfort songs.
2. **Cine y series** — géneros, plataformas, comfort movie, maratones vs capítulos sueltos.
3. **Anime y cómics** — géneros, formatos, convenciones, favoritos.
4. **Libros y lectura** — géneros, formatos (físico/digital/audiolibro), ritmo.
5. **Comida y antojos** — cocinas, dulces/salados, cafés vs antros.
6. **Viajes y planes** — playa/montaña/ciudad, fin de semana ideal.
7. **Estilo y moda** (opcional) — casual/formal/vintage, accesorios.

### 5.2 Formato

- **Opciones de una lista curada** (géneros, categorías, plataformas, artistas populares como
  texto plano).
- Selección única o múltiple.
- **Sin texto libre** (evita datos identificables).
- Sin reproducir letras ni contenido protegido.

### 5.3 Resultado

- Ficha amable: "Tu vibra musical: conciertos gigantes y playlists de estudio".
- Badges motivacionales nuevos (estándar del catálogo: nombre ≤ 3 palabras, frase ≤ 80 caracteres,
  2 variantes, sin rankear ni juzgar).
- Ejemplos: "Melómano/a de corazón", "Cinéfilo/a casual", "Viajero/a de fin de semana".

### 5.4 Uso como rompehielos

- En el panel del match y en el chat: "gustos en común" (solo con visibilidad mutua).
- Preguntas sugeridas derivadas de las coincidencias se añaden al banco de preguntas guiadas
  (categoría opcional "rompehielos").
- Ejemplo: si ambas coinciden en "conciertos", la pregunta sugerida es "¿cuál fue el último
  concierto que te voló la cabeza?".

## 6. Set "Picante" (18+, voluntario y con candado)

### 6.1 Acceso (todo obligatorio)

1. **Mayoría de edad declarada** — la persona declaró ser ≥ 18 al crear la cuenta
   (`profiles.adult_confirmed_at` no es nulo).
2. **Consentimiento explícito** — pantalla breve: qué es, que es opcional, que no entra al
   matching, que nadie ve sus respuestas salvo coincidencias mutuas que ella active, que se puede
   borrar con un toque. Guarda solo un booleano y la fecha, no la fecha de nacimiento.
3. **Track de romance activo** — la persona tiene activado el track de romance en su perfil.
4. **PIN de 4 dígitos** — se pide al entrar y se vuelve a pedir tras el bloqueo por inactividad
   (reutiliza el candado existente del chat, `chat_pins`).

Si no se cumple cualquiera de los 4, **la sección no se muestra ni se menciona**.

### 6.2 Contenido (guardarraíles)

**Tono:** sugerente, cálido y respetuoso, nunca explícito. No se describen actos, cuerpos ni
fluidos. Orientado a comunicación, ritmo, límites y consentimiento, con humor ligero.

**Formato:** Sí / Tal vez / No / Prefiero no decir, sin texto libre.

**Nivel 1 ("coqueto y romántico"):**
- Ritmo de una cita a la intimidad.
- Cómo prefieres hablar de límites.
- Lenguaje de afecto (palabras, gestos, tiempo).
- Coqueteo y mensajes (qué te gusta recibir, qué te gusta dar).
- Comodidad con el tema (qué tan abierto/a eres a platicar de esto).
- Preferencias de ambiente (música, luz, espacio).
- Cercanía física no sexual (abrazos, tomarse de la mano, besos).
- Iniciativa y juego de seducción en términos generales.

**Nivel 2 ("curiosidad adulta"):**
- Requiere **segunda confirmación** independiente (pantalla separada).
- Dinámicas y juegos de rol en términos generales y no gráficos.
- Preferencias sobre iniciativa y control formuladas como comunicación entre adultos.
- Comodidad con explorar cosas nuevas de a poco y con acuerdos previos.
- Límites duros y palabras de pausa (safe words).

**Prohibido:**
- Cualquier contenido que involucre a menores o edades ambiguas.
- Falta de consentimiento.
- Coerción o presión.
- Violencia que cause daño real.
- Sustancias.
- Ilegalidad.
- Humillación real.
- Fetichización de rasgos protegidos (raza, discapacidad, identidad de género u orientación).
- Presión para compartir fotos o datos.

**Linter de contenido:** el linter de `data/quizzes/picante.json` rechaza esas categorías y
términos explícitos. Ver `src/config/quiz-picante-linter.ts`.

**Revisión interna:** `docs/QUIZ_PICANTE_REVISION.md` lista todos los ítems y justifica que
cumplen los guardarraíles.

### 6.3 Revelación (la parte delicada)

1. **Nadie ve respuestas crudas ni "no" ni omisiones.**
2. Solo existe una vista de **coincidencias mutuas** y solo si **ambas personas** activaron la
   opción "compartir coincidencias de este set con mis matches" **para ese match concreto**.
3. Aparecen únicamente los temas donde **ambas** respondieron **Sí** o **Tal vez**, mostrados como
   "ambas están abiertas a platicar de..." y nunca como una puntuación de compatibilidad sexual ni
   como ranking.
4. Cualquiera puede **retirar su visibilidad en cualquier momento** y la coincidencia desaparece de
   inmediato.
5. **No** entra a explicaciones del match, badges públicos, constelación, perfil visible,
   notificaciones (que nunca mencionan el contenido), chat de preguntas guiadas ni analítica; no se
   usa para ordenar ni filtrar matches. Las métricas admin solo cuentan completados, con
   k-anonimato.
6. Las coincidencias aparecen **solo dentro de la conversación abierta** de ese match (chat libre)
   como una tarjeta privada de las dos personas, con un botón para ocultarla; no existe ninguna
   forma de exportarlas ni compartirlas fuera.
7. Botón de **reportar y bloquear** siempre visible; si se reporta a alguien por mal uso de esta
   sección, se cierra la visibilidad entre ambos.

### 6.4 Feature flag

`QUIZ_PICANTE_ENABLED=false` (variable de entorno). Con el flag apagado:
- No existe ninguna ruta ni UI visible para Picante.
- Las tablas y RPC existen pero no se usan.
- Al activarlo, se despliega con la sección apagada por defecto para cada persona (debe aceptar
  consentimiento).

## 7. Diseño y experiencia (pixel + dorado, accesible)

### 7.1 Pantalla Quizzes

- Tres tarjetas ilustradas en pixel art (nota musical, mando, llama).
- Progreso por estrellas (0–3 por quiz, una por cada mini-quiz completado).
- El tercer mosaico (llama) solo existe para quien cumple los requisitos de Picante (§6.1).
- Tono afectivo: "Explora tus gustos", "¿Qué te hace jugar?", "Coqueteo y ritmo (18+)".

### 7.2 Mecánica de quiz

- Una tarjeta por pantalla, opciones grandes tocables (≥ 44 px).
- Gesto de avance suave (swipe o botón).
- Barra de progreso en constelación (reutiliza el cielo, ADR-031).
- "Saltar" y "prefiero no decir" siempre a la vista.
- Cierre con ficha, badges y opción de compartir coincidencias.

### 7.3 Accesibilidad

- Números con la solución tipográfica definida (`src/ui/kit/pixel-number.tsx`).
- Contraste AA en ambos temas (claro y oscuro).
- `prefers-reduced-motion` respetado.
- Objetivos táctiles ≥ 44 px.
- Lectura correcta por lectores de pantalla (aria-label, role, aria-live).

### 7.4 Estados vacío/error/carga

- Carga: "Preparando tu quiz..." con spinner.
- Error: mensaje específico y amable, nunca el genérico "no pudimos leer la respuesta".
- Vacío: "Aún no has completado ningún quiz. ¿Empezamos con uno?".
- `requestId` corto cuando sea útil para reportar errores.

### 7.5 Copy y badges

- Mensajes con el motor de mensajes (variantes, `src/ui/chat/conversation-copy.ts`).
- Badges nuevos agregados al catálogo (`data/badges.json`) con lint de copy.

## 8. Pruebas

### 8.1 Unitarias (Vitest)

- Esquemas Zod de los tres JSON (`data/quizzes/*.json`).
- Linter de contenido del set picante (términos y temas prohibidos, nivel 2 requiere segunda
  confirmación).
- **RLS:** nadie lee respuestas ajenas (test con `service_role` vs `anon`).
- La RPC de coincidencias nunca devuelve respuestas individuales, "no" ni omisiones y exige
  visibilidad mutua **y** match vigente.
- El retiro de visibilidad elimina la coincidencia al instante.
- Borrado completo (un quiz o todos).
- Huevos sin acceso (sin identidad completa).
- La sección picante no aparece sin mayoría de edad declarada, sin consentimiento, sin track de
  romance o sin PIN.
- Ningún DTO, notificación ni log incluye respuestas.
- El modelo de matching, los puntajes y la identidad **no cambian** al completar quizzes (test de
  regresión que compare resultados antes/después).

### 8.2 Humo E2E

Con usuarios sintéticos:
1. Quizzes de gustos y gaming → coincidencias mutuas → chat con preguntas derivadas.
2. Flujo picante con dos personas (ambas activan → coincidencias; una retira → desaparece).

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Filtración de respuestas crudas | RLS estricta, RPC solo devuelve coincidencias, nunca respuestas individuales |
| Presión social | "Prefiero no decir" siempre visible, sin mostrar "no" de nadie |
| Menores en Picante | Triple guardia: mayoría de edad declarada + consentimiento + PIN |
| Contenido explícito | Linter de contenido, revisión interna, guardarraíles estrictos |
| Uso malintencionado de Picante | Botón de reportar/bloquear, cierre de visibilidad al reportar |
| Impacto en matching | Ninguno: los quizzes no entran al modelo psicométrico |
| Duplicación con chat prompts | Linter que verifica que no haya preguntas repetidas |

## 10. Archivos y migraciones

### 10.1 Migraciones nuevas

- `20261120000000_quizzes.sql` — tablas `quiz_attempts`, `quiz_answers`, `quiz_sharing`,
  `quiz_picante_consent`, RPC `quiz_coincidencias`, RLS y permisos.

### 10.2 Archivos de código nuevos

- `data/quizzes/gustos.json`, `gaming.json`, `picante.json` — definiciones de quizzes.
- `src/config/quizzes.ts` — carga y validación con Zod.
- `src/config/quiz-picante-linter.ts` — linter de contenido picante.
- `src/domain/quiz/` — lógica de dominio (coincidencias, visibilidad).
- `src/application/quiz/` — casos de uso (completar, borrar, compartir).
- `src/infrastructure/quiz/` — repositorio y rutas.
- `src/app/api/quiz/` — rutas API.
- `src/ui/quiz/` — componentes de UI.
- `src/app/quizzes/page.tsx` — pantalla principal.
- `src/app/quizzes/[quiz_id]/page.tsx` — pantalla de un quiz.

### 10.3 Archivos modificados

- `src/ui/result/result-view.tsx` — icono de quizzes en la navegación.
- `src/ui/chat/conversation-copy.ts` — preguntas sugeridas derivadas de coincidencias.
- `data/chat-prompts.json` — categoría opcional "rompehielos" con preguntas derivadas.
- `docs/PRIVACIDAD.md` — sección nueva sobre quizzes.
- `docs/DECISIONES.md` — ADR-041 (quizzes rompehielos).
- `docs/ESTADO_ACTUAL.md` — changelog de quizzes.
- `docs/QA.md` — checklist para probar con dos celulares reales.
- `docs/PENDIENTES_MANUALES.md` — nota sobre aviso de privacidad y consentimiento picante.

## 11. Decisiones

Ver `docs/DECISIONES.md` ADR-041.

## 12. Próximos pasos

1. Implementar Fase 1 (migración y servidor).
2. Implementar Fase 2 (Gustos).
3. Implementar Fase 3 (Gaming).
4. Implementar Fase 4 (Picante, con feature flag apagado).
5. Implementar Fase 5 (UI/UX).
6. Implementar Fase 6 (pruebas).
7. Implementar Fase 7 (docs y despliegue).
