# Insignias: la cuadrícula derivada

Las insignias son la única superficie del producto que **describe** lo que una persona ya
hizo; no puntúan, no rankean y no comparan. Este documento dice qué se muestra hoy, de qué
columnas sale cada número y qué se niega a decir. Las reglas no viven aquí: viven en
`data/badges.json` (umbrales y copy) y en `src/domain/badges/badge-progress.ts` (la
aritmética), y `src/config/badges.test.ts` y `src/domain/badges/badge-progress.test.ts`
son la razón por la que no pueden irse a la deriva.

Decisión: ADR-062 (el hueco medido) y ADR-066 (el montaje por vía derivada). Fila de la
matriz: T-43. Pendiente que queda abierto: M-14 en `docs/PENDIENTES_MANUALES.md`.

## 1. Lo que hay hoy, medido

La cuadrícula se monta en «Tu carta»: `src/ui/profile/profile-view.tsx` renderiza
`src/ui/badges/badge-grid.tsx` después de las afinidades, y solo cuando la lectura de
insignias devolvió una lista (`ProfileDto.unlockedBadges`, `src/contracts/profile.ts`).
El estado se **deriva en la lectura** (`src/application/profile-badges.ts`): no escribe una
fila, no necesita migración y no guarda nada.

No hay tabla de logros. La columna `matches.badges` no es esto: son chips de compatibilidad
de un par, calculados por el motor de matching, y son otro concepto con el mismo nombre en
inglés — por eso el campo nuevo se llama `unlockedBadges` y no `badges`.

## 2. Las seis insignias y de qué columna sale cada una

| ID | Nombre | Se desbloquea cuando | De dónde sale el número |
|---|---|---|---|
| `primer_match` | Primer match | `totalMatches ≥ 1` | conteo de `matches` que la propia carta ya pide |
| `conversacion_completada` | Primera conversación | ∃ conversación con ≥ 1 ronda hecha por las dos personas | `conversation_rounds` + `conversation_answers` vía `answeredRounds` |
| `tres_rondas` | Tres rondas | la conversación más lejana llega a 3 rondas | `completedRounds` (incluye revelado por reloj) |
| `chat_libre` | Chat libre | ∃ conversación en chat libre | `isFree`: `free_ready_a ∧ free_ready_b` ∨ 3 rondas |
| `semana_activa` | Semana activa | ≥ 7 días distintos con actividad propia | §3 |
| `tres_rompehielos` | Tres rompehielos | ≥ 3 quizzes completos | `quiz_attempts` (una fila por quiz, sellada en `completado_en`) |

Las fórmulas, en una línea cada una:

```
answered(c)   = |{ r ∈ rondas(c) : marca(a, r) ≠ ∅ ∧ marca(b, r) ≠ ∅ }|
completed(c)  = |{ r ∈ rondas(c) : answered en r ∨ now − r.creada ≥ 48 h }|
conversations = |{ c : answered(c) ≥ 1 }|
rounds        = max_c completed(c)            ← no es una suma
freeChat      = ∃ c: free(c)
```

`marca(a, r) ≠ ∅` es respuesta **o** «Pasar»: la ronda la hicieron las dos personas, y
elegir no contestar también es participar. El contraste importa y está probado
(`src/application/profile-badges.test.ts`): tres rondas reveladas por el reloj de 48 h sin
respuesta de nadie mueven `tres_rondas` y `chat_libre`, pero **no** declaran una conversación
completada. `rounds = max`, no suma, por la misma razón de honestidad: tres conversaciones
con una ronda no son una persona que llegó a la tercera ronda.

## 3. Días activos: la ventana, la zona y el tope

```
from        = now − (ventana_actividad_dias − 1) · 86 400 000
activeDays  = |{ dia_z(t) : t ∈ actividad, t ≥ from }|
```

- `dia_z` es el día **en la zona de la persona** (`zona_horaria = America/Mexico_City`,
  `supuesto_diseno`), no un corte UTC del servidor: las 06:30 Z y las 04:30 Z del mismo
  9 de noviembre son, en la Ciudad de México, el 9 y el 8. La prueba lo fija.
- La ventana es de 30 días, por eso `semana_activa` pide 7 y no promete racha: se cuentan
  días distintos, no consecutivos (ADR-062). El borde es inclusivo por un milisegundo: el
  instante exacto de `from` cuenta, `from − 1 ms` no.
- Las cinco fuentes de `actividad` son sellos que ya existen: quiz completado
  (`quiz_attempts.completado_en`), ronda que **esta persona** abrió
  (`conversation_rounds.created_at` + `asker`), mensaje que escribió
  (`conversation_messages.created_at`), el día que abrió la conversación
  (`conversations.seen_a` / `seen_b`) y su última acción (`conversations.updated_at` con
  `last_actor`). Nada de la contraparte cuenta como actividad propia.
- `tope_mensajes_ventana = 200`: la lectura de mensajes trae los 200 más recientes del
  periodo. Por eso el número **solo puede subestimarse**: si una persona tiene más de 200
  mensajes en la ventana, los días más viejos desaparecen del conteo y `semana_activa` puede
  seguir bloqueada aunque sí haya tenido 7 días activos. Medido, no teorizado: la prueba
  «can only understate the active days» monta 350 mensajes en 7 días reales y comprueba que
  la cuadrícula calla, y 140 mensajes en los mismos 7 días y comprueba que la desbloquea.
- «Contestó una ronda» no es fuente: `answersOf()` lee las respuestas sin su `created_at`,
  y el día en que alguien contesta es un día en que abrió la conversación, que ya está
  cubierto por `seen_*`. Añadirlo habría obligado a ensanchar un puerto que usa todo el chat
  para un sello que no aporta días nuevos.

## 4. La insignia de quizzes: qué cuenta y qué no se dice

`tres_rompehielos` es la única insignia que mira los quizzes, y lo hace como **un número**.
Las razones son de privacidad, no de diseño:

- Un intento en `quiz_attempts` solo se escribe al completar el quiz (`private.quiz_mark_completed`),
  así que contar filas es contar quizzes completos; no se infla con abandonos.
- **No** hay una insignia por quiz ni por categoría. Decir «terminaste el quiz picante»
  revelaría, en una pantalla que puede estar abierta delante de alguien, una participación
  en contenido +18. La insignia agrega, y el payload lleva solo ids: `getAttempts` se lee,
  su `quiz_id` nunca sale hacia el cliente (prueba: el JSON del resultado no contiene el
  nombre de ningún quiz).
- La categoría tampoco viaja: `ProfileDto` no recibe ni conteos por quiz, ni fechas de
  intento, ni el `revision` con el que se contestó.

El umbral (3) es `supuesto_diseno` y está anotado en `data/badges.json`; no pretende ser
una cifra de literatura.

## 5. Dos silencios deliberados

**Sin fecha.** Ninguna columna guarda el día en que alguien ganó un logro, así que la
cuadrícula no muestra fechas y `BadgeDisplay.desbloqueadoEn` desapareció del dominio en
lugar de rellenarse con una derivada. Una fecha inventada sería un dato falso sobre una
persona.

**Sin «cero» cuando la lectura falla.** `deriveBadges` devuelve `null` si cualquier lectura
(`listFor`, `roundsOf`, `answersOf`, `recentMessagesBy` o los intentos de quiz) falla o
lanza; un cero diría «no has hecho nada de esto», que es una afirmación sobre la persona,
mientras que `null` significa «hoy no lo sabemos». La sección simplemente no se monta
(`unlockedBadges ? <BadgeGrid/> : null`). La prueba de la carta cubre el caso.

Y un tercer silencio, de copy: la nota que se ve bajo la cuadrícula
(`copy.nota_derivada`) dice que los logros se calculan con lo que ya se hizo y que no se
lleva un registro de ellos. La promesa técnica y la promesa a la persona son la misma frase.

## 6. Por qué derivada y no persistida (M-14)

M-14 pedía la superficie antes que los logros nuevos, y ofrecía dos caminos. El persistido
significa tabla nueva, escritura en cada hito, backfill y una fecha real por insignia; el
derivado significa solo lecturas que ya existen. Se eligió el derivado porque:

- no escribe datos de personas, así que no hay nada que respaldar ni que purgar;
- no necesita migración, y por lo tanto no depende de la ventana de mantenimiento;
- es reversible: si mañana llega el catálogo persistido, la función derivada se convierte en
  la comprobación de que la tabla no mintió.

Lo que el camino derivado **no** da, y por lo que M-14 queda a medias: fecha de desbloqueo,
«acabas de ganar» y cualquier insignia que necesite un hecho que hoy no se almacena (por
ejemplo, «una conversación que duró 30 días» necesita historia, no la fila actual).

## 7. Las invariantes que sujetan las pruebas

Cada línea es una prueba, no una intención:

1. `|BADGE_CATALOG| = 6`, ids únicos e iconos únicos (la cuadrícula se lee por forma, no por
   posición) — verificado también por Zod al cargar el config.
2. `unlockedBadgeIds` devuelve solo ids del catálogo, en orden del catálogo, y es monótono:
   subir un contador no puede quitar una insignia.
3. `activeDays ≤ ventana_actividad_dias` siempre, para cualquier lista de sellos.
4. `completedRounds = max_c completed(c)`, nunca la suma.
5. Ningún renglón del payload contiene texto de una respuesta ni de un mensaje, ni un id de
   quiz, ni un `user_id`.
6. Lectura rota ⟹ `null`; y `null` ⟹ la pantalla no muestra la sección.
7. Ninguna insignia promete racha ni juzga (`copy-guard` y las palabras prohibidas de
   `src/domain/badges/badge-types.test.ts`), y todo el copy respeta el presupuesto de
   `docs/QUIZZES.md` §5.3: nombre de ≤ 3 palabras, frase de ≤ 80 caracteres.
