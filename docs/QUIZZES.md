# Quizzes rompehielos: Gustos, Gaming, Vida, Conexión y Picante (18+)

> **Estado (2026-11-09):** los cinco sets están en el catálogo. §13 es lo que cambió
> en el pulido: opt-out obligatorio, respuesta múltiple, peticiones agrupadas y la
> validación antes de escribir.

## 1. Qué son y qué no son

Los **quizzes rompehielos** son una sección opcional de ZooMatch con sets cortos y lindos
que sirven para **romper el hielo** en las conversaciones:

1. **Gustos** — música, cine, comida, viajes.
2. **Gaming** — plataformas, géneros, estilo de juego, juegos de mesa.
3. **Vida** — planes y dinero, campus, humor.
4. **Conexión** — autoexpansión, cuidado y afecto, valores en situaciones.
5. **Picante (18+)** — coqueteo, ritmo, límites, curiosidad adulta (voluntario, con candado).

> No confundir con los **tres quizzes del cuestionario obligatorio** (ADR-045): esos son el
> test psicométrico repartido en bloques de máximo 35 reactivos para no cansar, y se envían
> juntos al terminar el último. Estos son opcionales, no puntúan y no entran en el perfil.

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
5. Al completar: ficha con resultado amable ("Tu vibra musical: ..."), badges motivacionales
   (pendiente: ver §5.3) y opción de **compartir coincidencias con matches** (apagada por defecto,
   con explicación breve).

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

Viven en `data/quizzes/*.json`, validados con esquemas Zod (18 quizzes, 150 ítems):

| Archivo | Quizzes | Ítems | Contenido |
|---|---|---|---|
| `gustos.json` | 4 | 32 | música, cine, comida, viajes (§5) |
| `gaming.json` | 4 | 32 | plataformas, géneros, estilo, juegos de mesa (§13.1) |
| `vida.json` | 3 | 27 | planes y dinero, campus, humor (§13.2) |
| `conexion.json` | 3 | 27 | autoexpansión, cuidado, valores en situaciones (§13.3) |
| `picante.json` | 4 | 32 | coqueteo, curiosidad adulta, vanilla/kink, dinámicas (§6) |

Cada quiz tiene:
- `quiz_id` — identificador único (ej: `gustos_musica`, `gaming_plataformas`, `picante_nivel1`).
  Empieza con su categoría, y así lo revisa `src/config/quiz-catalogue.test.ts`.
- `revision` — versión del contenido (ej: `1`). Si cambia el contenido, se incrementa.
- `categoria` — agrupación (gustos, gaming, vida, conexion, picante).
- `nivel` — para Picante: 1 (coqueto) o 2 (curiosidad adulta).
- `item_id` — identificador del ítem **dentro del quiz**. Se repiten entre quizzes
  (`plataforma` está en `gustos_cine` y en `gaming_plataformas`), por eso los seguimientos
  se buscan con la llave `quiz_id/item_id`.
- `texto` — pregunta o enunciado.
- `opciones` — lista curada de opciones (sin texto libre). La última es siempre
  `OPT_OUT_LABEL` («Prefiero no decir»): lo exige el `.refine` del esquema, así ningún quiz
  nuevo puede nacer sin la salida.
- `multiple` — booleano: selección única o múltiple.
- `dimensiones_relacionadas` — etiquetas de conversación. Nunca son dimensiones
  psicométricas (`src/domain/quiz/isolation.test.ts`).

**Evitar duplicados con el banco de preguntas del chat:** los quizzes no repiten las preguntas de
`chat-prompts.json`. Si un quiz toca un tema similar (ej: música), la pregunta sugerida derivada de
la coincidencia es distinta a las del banco. `src/domain/quiz/quizzes.test.ts` compara las
sugerencias de los 18 quizzes contra el banco, incluidas sus variantes.

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
- Badges motivacionales nuevos: **no implementado**, y ahora se sabe por qué es más
  grande que una condición nueva. El catálogo real vive en
  `src/domain/badges/badge-catalog.ts` (cinco insignias, ninguna de quizzes) y una por quiz
  pediría tres cosas que hoy no existen: una condición `{ tipo: "quizzes_completados" }` en
  `BadgeCondition`, que el evaluador sepa contar intentos por categoría y un `BadgeId` por set.
  Y debajo de eso está el hueco de verdad: **ninguna pantalla monta la cuadrícula** —
  `BadgeGrid` no lo importa nadie, `ProfileDto` no trae insignias y no hay tabla de logros,
  así que hoy ninguna persona puede haber ganado ninguna. Medido y explicado en ADR-062,
  registrado como M-14 en `docs/PENDIENTES_MANUALES.md`: primero la superficie, después las
  insignias nuevas.
  El estándar de copy sí está escrito y es duro: nombre ≤ 3 palabras, frase ≤ 80 caracteres,
  2 variantes, sin rankear ni juzgar.
- Ejemplos (de cómo se leerían, no de lo que hay): "Melómano/a de corazón", "Cinéfilo/a casual",
  "Viajero/a de fin de semana".

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
- Insignias en `src/domain/badges/badge-catalog.ts` (no `data/badges.json`: ese archivo nunca
  existió). Ninguna insignia habla de quizzes todavía, ver §5.3.

## 8. Pruebas

### 8.1 Unitarias (Vitest)

Lo que ya está cubierto, archivo por archivo en §13.11. En corto:

- Esquemas Zod de los cinco JSON (`data/quizzes/*.json`).
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
- El modelo de matching, los puntajes y la identidad **no cambian** al completar quizzes. Hoy se
  sostiene de dos lados: `isolation.test.ts` prueba que la capa rompehielos no importa el motor,
  y `actions.test.ts` que completar solo invoca `saveAnswers` y `markCompleted`. La comparación
  numérica antes/después con dos cuentas reales queda para el humo E2E (§12.1).

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

### 10.2 Archivos de código

Catálogo y carga:

- `data/quizzes/gustos.json`, `gaming.json`, `vida.json`, `conexion.json`, `picante.json` — las
  cinco definiciones (18 quizzes, 150 ítems).
- `src/config/quizzes.ts` — carga y validación con Zod, incluido el `.refine` que exige
  `OPT_OUT_LABEL` como última opción de cada ítem.
- `src/config/quiz-catalogue.ts` — catálogo por categoría y el orden del hub.
- `src/config/quiz-picante-linter.ts` — linter de contenido picante.

Lógica:

- `src/domain/quiz/quizzes.ts` — opt-out, valor guardable, coincidencias, explicaciones,
  preguntas sugeridas y el par de una conversación.
- `src/application/quiz/actions.ts` — casos de uso (completar, borrar, compartir, progreso,
  coincidencias) sobre `src/application/quiz/ports.ts`.
- `src/infrastructure/quiz/quiz-repository.ts` — repositorio Supabase.

API (`src/app/api/quizzes/`, separada del test psicométrico en `src/app/api/quiz/`):

- `route.ts` — guardar respuestas de un quiz.
- `progreso/route.ts` — cuántas respuestas hay por quiz, en una sola lectura para todo el hub.
- `coincidencias/route.ts` — coincidencias de los 14 quizzes no-18+ de una conversación, en una
  sola lectura; recibe `conversacion`, nunca el id de la otra persona.
- `picante/access/route.ts` y `picante/consent/route.ts` — acceso y consentimiento de Picante.

UI:

- `src/ui/quiz/quizzes-view.tsx` — el hub.
- `src/ui/quiz/quiz-flow-view.tsx`, `quiz-flow.ts`, `quiz-draft.ts`, `reveal.tsx`,
  `reveal-order.ts`, `quiz-icon.tsx`, `picante-consent.tsx`, `public-quiz.tsx`.
- `src/app/quizzes/page.tsx` y `src/app/quizzes/[quiz_id]/page.tsx` — pantallas.
- `src/ui/chat/quiz-coincidencias.tsx` — el panel plegable dentro de la conversación.

### 10.3 Archivos modificados

- `src/ui/result/result-view.tsx` — icono de quizzes en la navegación.
- `src/ui/chat/conversation-view.tsx` — monta el panel de coincidencias.
- `src/app/quiz.css` — estilos del panel y del hub.
- `docs/PRIVACIDAD.md` — sección nueva sobre quizzes.
- `docs/DECISIONES.md` — ADR-041 (quizzes rompehielos) y ADR-060 (los cinco sets y el opt-out).
- `docs/ESTADO_ACTUAL.md` — changelog de quizzes.
- `docs/QA.md` — checklist para probar con dos celulares reales.
- `docs/PENDIENTES_MANUALES.md` — nota sobre aviso de privacidad y consentimiento picante.

## 11. Decisiones

Ver `docs/DECISIONES.md` ADR-041 y ADR-060.

## 12. Próximos pasos

Hecho queda todo el catálogo y su motor (Fases 1–7). Lo que sigue, en orden de valor:

1. Playwright sobre el hub y el flujo de coincidencias (M-07 del plan de QA).
2. Medir en dos celulares reales si las explicaciones de coincidencia caben sin scroll.
3. Microencuesta post-chat de una pregunta (sin escala de atractivo, sin ranking).

## 13. El catálogo completo y su pulido (2026-11-09)

### 13.1 Gaming — `data/quizzes/gaming.json`

Cuatro mini-quizzes, 32 ítems. Venía implementado desde la Fase 3 pero sin sección propia.

| quiz_id | Título | Ítems | Min |
|---|---|---|---|
| `gaming_plataformas` | Tu setup gamer | 8 | 2 |
| `gaming_generos` | Tus géneros favoritos | 8 | 2 |
| `gaming_estilo` | Tu estilo de juego | 8 | 2 |
| `gaming_mesa` | Juegos de mesa y rol | 8 | 1 |

### 13.2 Vida — `data/quizzes/vida.json`

Nueve ítems por quiz, 1.5 min. Cubre «estilo de vida y planes», «vida en el campus» y «humor».
En campus se pregunta por rutinas y lugares, nunca por horarios exactos, carrera, ni grupo:
cualquier dato que ubique a alguien en el tiempo y el espacio queda fuera.

| quiz_id | Título | Ítems | Min |
|---|---|---|---|
| `vida_planes` | Tu fin de semana ideal | 9 | 1.5 |
| `vida_campus` | Tu vida en el campus | 9 | 1.5 |
| `vida_humor` | Tu humor | 9 | 1.5 |

### 13.3 Conexión — `data/quizzes/conexion.json`

Autoexpansión, cuidado/afecto y valores en situaciones. Los tres están redactados para servirle
igual a una amistad que a una pareja, y ninguno entra al puntaje: `conexion_valores_situaciones`
usa mini dilemas ligeros, sin trampa ni calificación, y sus ítems van etiquetados como
`personalidad`/`estilo` para no chocar con la dimensión psicométrica «valores».

| quiz_id | Título | Ítems | Min |
|---|---|---|---|
| `conexion_autoexpansion` | Algo nuevo por probar | 9 | 1.5 |
| `conexion_cuidado` | Cómo cuidas y te cuidan | 9 | 1.5 |
| `conexion_valores_situaciones` | Valores en situaciones | 9 | 1.5 |

### 13.4 «Prefiero no decir» deja de ser una promesa

El esquema Zod exige que la última opción de cada ítem sea exactamente `OPT_OUT_LABEL`
(«Prefiero no decir»), así que ningún quiz nuevo puede nacer sin salida. Al guardarse se
convierte en `OPT_OUT_VALOR` (`prefiero_no_decir`), que es el valor que `quiz_coincidencias`
ya filtraba en la base: por eso **no hizo falta migración**.

Dos reglas que sí cambiaron el comportamiento:

- Un ítem sin respuesta **ya no se guarda como opt-out**. Antes el formulario rellenaba
  `prefiero_no_decir` en todo lo vacío, o sea: le ponía en la boca a alguien una decisión que
  no tomó. Ahora un ítem sin tocar no escribe renglón.
- `esOptOut` compara en minúsculas. Los ítems de acuerdo guardan `"No"` con mayúscula, y
  `'No' !== 'no'`, así que hasta ahora una negativa de Picante podía aparecer como coincidencia.

### 13.5 Respuesta múltiple en una columna

`quiz_answers` tiene una fila por `(persona_id, quiz_id, item_id)` y un solo `valor TEXT`. Los
ítems `multiple` se guardan con `valorGuardable`: opciones válidas, deduplicadas y ordenadas
unidas por `"; "`. Se verificó que ninguna opción del catálogo contenga `;` ni `|`, así que el
separador no puede aparecer dentro de un valor. Con una sola selección no se agrega separador,
así que los renglones que ya existen siguen coincidiendo igual.

### 13.6 El hub y el chat hablan en una sola petición

El hub muestra 18 tarjetas. Pedir el estado quiz por quiz eran 18 peticiones contra un límite de
30 por minuto (`withApiSecurity`), así que al tercer refresh todo salía «Pendiente» sin estarlo.
Ahora:

- `GET /api/quizzes/progreso` — cuántas respuestas hay por quiz, en una lectura
  (`countAnswersByQuiz` en `src/infrastructure/quiz/quiz-repository.ts`).
- `GET /api/quizzes/coincidencias?conversacion&quiz_ids` — varias coincidencias con
  `Promise.all` del lado del servidor. El panel del chat cubre los 14 quizzes no-18+ en una
  petición, no en 8.
  Viaja el id de la conversación y no el de la otra persona por dos razones: el contrato del chat
  (`src/contracts/chat.ts`) nunca reparte `user_id` al cliente, y así la ruta resuelve el par con
  `findFor(id, quien_pregunta)`, que ya es la compuerta que verifica que eres parte de esa
  conversación. Nadie puede asomar la nariz a una pareja que no es la suya.
  Eso se mide en la ruta misma (`src/app/api/quizzes/coincidencias/route.test.ts`, 9 pruebas): un
  tercero recibe 403 **antes** de que se llame a leer una sola coincidencia, y un `otra_persona`
  pegado en la URL no cambia quién es el par.

### 13.7 Nada llega a la base sin estar declarado

`revisarRespuestas` (`src/application/quiz/actions.ts`) corre antes de cualquier escritura y
rechaza un `item_id` que el quiz no declara (`quiz.item_no_declarado`, 400) o un `valor` que no
es opción del ítem (`quiz.valor_no_valido`, 400). Se valida todo el lote primero: un rechazo no
deja medio quiz guardado.

### 13.8 Picante: a quién le llega

- El panel de coincidencias del chat **no incluye Picante**. La revelación 18+ sigue siendo solo
  por coincidencia mutua y en su propia pantalla de resultado, sin presión en la bandeja.
- `picante_dinamicas` calcula leyendo respuestas sueltas en JavaScript, así que esquivaba el
  filtro SQL. Ahora `obtenerCoincidenciasDinamicas` exige `puedeCompartirPicante` en las dos
  partes antes de leer una sola respuesta. El rastro que se revisa es el sello que quedó al dar
  el consentimiento (`track_romance_activo` en `quiz_picante_consent`), no el valor vivo del
  perfil.
- Sigue en pie lo que ya hacía: mayoría de edad + consentimiento para *entrar*, y bandera de
  seguridad en «No» apaga las dinámicas.

### 13.9 Explicaciones y sugerencias

`explicarCoincidencia` traduce una coincidencia a una línea en español («Coinciden en: PC»); en
los ítems de acuerdo cita el enunciado, porque su valor es un «sí» que no dice nada solo.
`generarPreguntasSugeridas` devuelve como máximo `MAX_PREGUNTAS_SUGERIDAS` (3) preguntas abiertas
por quiz, sin repetir, buscadas con la llave `quiz_id/item_id`; si falta la llave cae en una red
de seguridad por categoría. La llave larga no es decorado: `plataforma` y `ritmo` existen en dos
quizzes distintos y sin ella el chat sugería la pregunta del quiz equivocado.

Todo eso se ve: `src/ui/chat/quiz-coincidencias.tsx` está montado en la conversación, entre la guía
de primera vez y las rondas (`src/ui/chat/conversation-view.tsx`), plegado por defecto para no
cobrar altura en móvil. Sin coincidencias no pinta nada.

Y sí, desde ADR-063 las sugerencias **también** entran en la tanda de las tres rondas, que era lo
que faltaba: `src/infrastructure/chat/coincidence-questions.ts` reusa la misma RPC
`quiz_coincidencias` (el candado no se duplica) y `mixCards` (`src/domain/chat/question-cards.ts`)
pone una de esas preguntas al frente de las tres tarjetas que ofrece `rounds.coincidences` = 1.
Rige la misma exclusión de Picante y del `resultado_personal` que acabamos de describir, y del chat
solo viaja el texto de la pregunta, nunca el valor contestado. Se apaga desde config escribiendo
`rounds.coincidences = 0`; la otra mitad del camino (`docs/CHAT.md` §11.2) dice cómo se pide y cómo
se guarda.

### 13.10 El hub perdió los emojis y ganó orden

Los íconos de sección son `Icon` del kit (`src/ui/kit/icon.tsx`), no caracteres emoji: los
lectores de pantalla los leen mal y reñían con el sistema de diseño pixel. El orden del hub es
`QUIZ_CATEGORIES`: gustos, gaming, vida, conexión, picante — el 18+ hasta el final, y desaparece
de la lista cuando la compuerta está apagada.

### 13.11 Pruebas

| Prueba | Qué sostiene |
|---|---|
| `src/config/quiz-catalogue.test.ts` | 18 quizzes y 150 ítems, opt-out en cada ítem, títulos de cinco palabras o menos, cero emojis, 8–10 ítems y ≤2 min en los sets nuevos |
| `src/domain/quiz/quizzes.test.ts` | `esOptOut`, `valorGuardable`, `valorValido`, coincidencias, explicaciones, sugerencias sin duplicados con el banco de chat |
| `src/domain/quiz/isolation.test.ts` | ninguna dimensión psicométrica en un quiz y ningún import del rompehielos hacia el motor, la psicometría o la identidad |
| `src/application/quiz/actions.test.ts` | validación antes de escribir, borrado por quiz, compuertas de visibilidad, match y consentimiento mutuo |
| `src/config/quiz-picante-linter.test.ts` | guardarraíles de contenido 18+ |
