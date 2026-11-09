# Manual del observatorio (panel de administración)

Ruta: `/admin`. Acceso con matrícula UNAM + PIN administrativo; cada entrada y
cada salida quedan en la auditoría. La sesión dura lo que diga
`data/admin-config.json` (`session.maxMinutes`, con `session.idleMinutes` de
inactividad) y el servidor rechaza intentos repetidos por dirección.

Este documento describe **qué significa cada número** que aparece en el panel.
Nada de lo que se muestra aquí permite identificar a una persona: es la regla
ADR-036 (sin matrículas, sin hashes, sin respuestas, sin vectores, sin θ, sin
filtros duros y sin afinidades individuales en las métricas).

## Cuatro pestañas

| Pestaña | Qué contiene |
| --- | --- |
| Agregados | el observatorio: series, embudo, calidad, composición, contadores |
| Personas | listado paginado con facetas y orden |
| Reportes | reportes de chat abiertos, revisados y cerrados |
| Auditoría | cada acción administrativa, con su alias |

---

## Ventana de días

El selector `7 / 30 / 90 días` es **la única perilla que cambia lo que calcula
la base**. El valor viaja a `/api/admin/metrics?days=N` y el servidor sólo
acepta los números listados en `ADMIN_CONFIG.metrics.windowsDays`; cualquier
otro (incluso escrito a mano en la barra de direcciones) cae al valor por
omisión, 30 días. Por eso una ventana no puede ensancharse más allá de 90 días
ni pedir un rango arbitrario.

La línea de estado dice `Última lectura · <UTC> · ventana pedida: N días`. La
lectura se repite sola cada `EXPERIENCE.admin.pollMs` (60 s) sólo si la pestaña
está visible.

**Si el panel avisa "Esta lectura no trae el observatorio ampliado"**, la base
respondió con la versión vieja del RPC (dos argumentos): sólo hay umbrales y
los desgloses clásicos. Sucede mientras una instancia todavía no ve la
migración `20261121000000_admin_observatorio.sql`.

---

## Contadores dorados: ligues y novios

Dos cuentas **manuales**: parejas que se reconocieron como ligues o como
novios, dicho por ellas. La base no puede calcularlas: no hay ninguna columna
que registre "ya son novios", así que el número lo mantiene quien administra.

- `+1` y `−1` mueven el contador un paso. Un paso se puede deshacer con el
  paso contrario, así que no pide confirmación.
- **Corregir** escribe el valor exacto. Pide la palabra `CORREGIR` porque
  reemplaza (no suma) y puede borrar de un golpe semanas de pasos.
- El valor vive entre **0 y 100 000**: el tope y el suelo los impone la base
  (columna con `CHECK` y `GREATEST/LEAST` bajo `FOR UPDATE`), no el navegador.
- Cada movimiento escribe su propia fila de auditoría `counter_update` con
  `{key, antes, despues, delta}`. El panel muestra `la base guardó X (antes Y)`
  con el número que devolvió la consulta, no con el que tecleamos.
- **Densidad** = `100 × parejas / cuentas eclosionadas`. Se expresa *por cada
  100 cuentas eclosionadas* y no como porcentaje porque una pareja involucra a
  dos personas: un porcentaje de cuentas sería un error de categoría. Sin
  cuentas eclosionadas no hay densidad (se dice explícitamente), lo cual no es
  lo mismo que una densidad de cero.

Es la única cifra del observatorio en dorado (ADR-027 reserva el dorado para
el nodo de una persona y sus matches ≥ 95 %). Aquí el dorado significa otra
cosa: *esto no lo midió el sistema, lo escribió una humana*. Usa sólo las
primitivas sancionadas (`PixelNumber gold`, la clase `.zm-pixnum--gold` y el
token `--zm-gold` de cada tema).

---

## Evolución diaria

Tiras de píxeles por evento: **altas, encuestas, eclosiones, en pausa, bajas**.
Cada tira se escala con **su propio día más ocupado**, no con el máximo común:
una tira describe la forma del día, no la magnitud relativa entre eventos. El
total de la ventana se imprime al lado.

Reglas de dibujo: `ceil`, así que el día más ocupado llena la columna entera y
un día con un solo evento nunca queda invisible; un máximo de 0 no dibuja nada
en vez de dividir entre cero.

La tabla de abajo agrupa por **semanas de 7 días, de más antiguo a más
nuevo**, y conserva los totales: la suma de las semanas es la suma de los días.

## Embudo de participación

Cuatro pasos que son subconjuntos uno del otro, y dos ramas que no:

| Paso | Quién cuenta |
| --- | --- |
| Registradas | perfiles sin `eliminado_en` |
| Con encuesta completa | además `quiz_completed_at` |
| Con identidad fijada | además `estado_identidad = 'eclosionado'` |
| Presentes | encuesta completa, **sin pausa** y sin borrar |
| Presentes con afinidad de romance | rama desde *Presentes* |
| Presentes con afinidad de amistad | rama desde *Presentes* |

Las dos últimas son ramas porque una persona puede estar en ambas a la vez:
sumarlas como si fueran el quinto y sexto paso del embudo daría una cascada
falsa. "Presentes" es el mismo conjunto que define `private.live_pairs`: lo que
alguien puede abrir hoy.

Dos porcentajes por fila:

- `% del inicio` = `round(100 × fila / registradas)`; con el cielo vacío es 0,
  nunca `NaN`.
- `% del paso anterior` = `round(100 × fila / fila previa)`; **no se calcula**
  sobre una fila inexistente y se imprime como `—`. Una tasa de nadie no es una
  tasa de cero, y el panel no puede afirmar que no se perdió a nadie.

## Tiempo hasta eclosionar

Horas entre `created_at` y `eclosionado_en`, sobre las cuentas vivas que tienen
ambas fechas: mediana y p75 con `percentile_cont`.

**Con menos de `EXPERIENCE.admin.kAnonymity` (5) eclosiones en la muestra no se
publica el cuantil**, ni siquiera redondeado. La razón es distinta a la de un
conteo: una mediana sobre tres personas *es* los datos de esas tres personas.
Un conteo pequeño se enmascara como `< 5`; un cuantil pequeño se omite.

---

## Calidad del matching (histograma por pista)

El eje es la similitud **normalizada**, no la similitud cruda:

```
z = (similitud − umbral) / (reference_high − umbral)
```

- `z = 0` es el corte de la pista; `z = 1` es su `reference_high`.
- La caja `i` cubre `z ∈ [0.25 i, 0.25 (i + 1))`; son **12 cajas** (`v_width =
  0.25` en SQL y `BIN_WIDTH = 0.25` en el panel, el mismo número).
- `i = 0` está sobre el corte y `i = 4` sobre la referencia; esas dos columnas
  llevan la marca `umbral` y `referencia`.
- Dos columnas fuera del eje: **bajo el umbral** (`sim < umbral`) y **fuera
  del eje** (`i ≥ 12`).
- Invariante que debe cumplirse siempre, y que se comprueba en los tests:

```
filas = bajoUmbral + Σ(n de las cajas) + sobreEje
```

Es decir: el histograma nunca pierde parejas ni las inventa.

Calibración medida en producción (2026-11-08), la que usa el panel:

| Pista | Umbral (corte) | `reference_high` |
| --- | --- | --- |
| Romance | 0.5374 | 0.5877 |
| Amistad | 0.4643 | 0.5524 |

Si el payload no trae una referencia utilizable (`reference ≤ umbral`) **no hay
eje**: el panel lo dice con palabras en lugar de dividir entre cero. Media,
mediana, p90 y máximo se leen sobre las parejas vivas de la pista; en una pista
vacía son `—`, no 0.

`conAfinidad` / `aislados` cuentan personas presentes, no parejas: *aislados*
son las que estando presentes no abren ninguna afinidad en esa pista.

## Composición del cielo

Tres bloques de barras sobre quien ya eclosionó (un huevo no tiene animal, ni
color, ni tipo fijado): **eneagrama**, **marcas** (`sp` autoconservación, `so`
social, `sx` uno a uno) y **módulos** completados. Las celdas vienen de un
`jsonb_object_agg` que no promete ningún orden, así que el panel ordena por
cantidad y desempata por nombre: de otro modo las filas se barajarían entre
lecturas. El total entre paréntesis es por sección, no por el cielo completo.

## Actividad de administración

Cuántas acciones hizo el propio observatorio dentro de la ventana, por tipo y
por día. Son recuentos de acciones administrativas, no de personas, así que
aquí no aplica el piso de anonimato: la pestaña Auditoría ya lista cada una con
su alias. Un tipo de acción que la base conozca y el panel todavía no se
muestra con su clave cruda, no como `undefined`.

## Anonimato en los desgloses

El piso es `EXPERIENCE.admin.kAnonymity` = **5 perfiles**. Con menos de 5
perfiles en el cielo, los desgloses desaparecen por completo con un aviso.
Dentro de un desglose, una celda con menos de 5 se dibuja vacía y se lee
`< 5`. La consecuencia es que una celda en sombra tampoco fija la escala de la
gráfica: no puede agrandar a sus vecinas.

---

## Personas: búsqueda, facetas y orden

- **Búsqueda sólo por alias** (`ADMIN_CONFIG.users.searchMaxChars` = 40
  caracteres). Las matrículas no se guardan en claro, así que no se puede
  buscar por ellas ni aunque se escriba una.
- **Facetas**: identidad (en el cascarón / con identidad fijada), perfil (sólo
  pausadas / sólo activas), sin afinidad de (romance / amistad), rol (sólo
  cuentas admin), tipo MBTI y orden. Más dos fechas de alta (`desde`, `hasta`,
  en `AAAA-MM-DD`).
- Elegir `todos` en una faceta **no envía parámetro**: la base lee la ausencia
  como "sin filtro". Un solo valor inválido haría que el servidor descarte
  *toda* la combinación de facetas, así que las opciones del panel están
  atadas al contrato y hay un test que lo verifica.
- Cambiar una faceta reinicia la página a 1: la página 3 de un filtro que
  nadie pidió no es una página.
- **Orden**: las cabeceras Alias, Afinidades R/A y Alta son botones. Cada clic
  avanza por su propio ciclo —fecha alterna recientes/antiguas, afinidades
  alterna más/menos, alias tiene un solo orden— y la flecha visible coincide
  con la que la base está aplicando. El atributo `aria-sort` dice ascendente o
  descendente de verdad: "más recientes" y "más afinidades" son descendentes.
- Cada página está acotada (`ADMIN_CONFIG.users.pageSize` = 25) y las facetas
  viajan en la cadena de consulta de `/api/admin/users`, así que la misma
  lectura se puede reproducir a mano para revisar esa combinación exacta.

## Auditoría

`ADMIN_CONFIG.audit.pageSize` = 50 por página. Cada fila dice fecha UTC, alias
del admin, acción, cuenta afectada y detalle. Las acciones con palabra de
confirmación (borrar, reiniciar cuestionario, restablecer PIN, `CORREGIR` en un
contador) quedan registradas con lo que la base guardó.

---

## Exportar CSV

`Exportar CSV` serializa **todo** lo que el observatorio ya mostraba: resumen,
topes de animalitos y colores, MBTI, ventana pedida, serie diaria, embudo con
ambas tasas, tiempo hasta eclosionar, calidad por pista con sus percentiles,
cada caja del histograma, composición, contadores manuales y auditoría.

- UTF-8 con **BOM**, filas **CRLF** (Excel en Windows abre el archivo sin
  romper las tildes).
- Las celdas de texto libre (nombres, alias de quien movió un contador) pasan
  por la neutralización de inyección de fórmulas: una celda que empieza con
  `=`, `+`, `-` o `@` se publica con comilla simple adelante.
- Los números viajan **tal como los dio la base**: sin redondear en la
  exportación. Un cuantil sin muestra sale como `—`, no como 0.
- La suma de las filas del histograma de una pista, leídas del CSV, es igual a
  `filas` en la línea de calidad. Es la misma invariante del panel.

## Recalcular afinidades

`Recalcular afinidades` es manual y limitada a 5 por minuto: la ruta responde
cuando el recálculo terminó, así que el panel vuelve a leer la ventana apenas
ella contesta. Lo que puede quedar pendiente no es este botón sino las acciones
sobre una cuenta (pausar, reactivar, borrar): si el recálculo que disparan no
termina en línea, la respuesta trae `recomputePending` y el aviso dice que se
hará en el siguiente intento. El panel no afirma que algo ya terminó cuando
sólo lo encoló.
