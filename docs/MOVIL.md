# Guia de diseno movil — ZooMatch

Este documento describe los patrones de interaccion movil implementados en las
fases 3 a 7 del proyecto ZooMatch. Todo el diseno sigue la estetica pixel-art
del Atlas de bolsillo y respeta las restricciones del sistema de tokens.

## Restricciones globales

- Sin `framer-motion`: todas las animaciones son CSS puro (`@keyframes`).
- Sin `backdrop-blur`, `rounded-*`, ni emojis en CSS.
- Sin palabras prohibidas en el copy (solo, siempre, nunca, tienes que, debes,
  por que no, deberias, obligacion, problema, triste, sola, soledad).
- Todo el copy en espanol (es-MX), tono calido y sin presion.
- Objetivos tactiles minimos: 44px (`--zm-touch`).
- Cada longitud es multiplo de `--zm-px` (2px logico).

---

## Fase 3: Inmersion movil

### Gestos de deslizamiento (swipe)

Las tarjetas de match en la vista de resultado soportan gestos de deslizamiento
en dispositivos tactiles:

- **Deslizar a la derecha**: indica "me gusta". Activa el sonido
  `match_nuevo` y una vibracion corta.
- **Deslizar a la izquierda**: indica "pasar". Activa el sonido `tap`.
- **Umbral**: 80px de desplazamiento horizontal para registrar el gesto.
- **Tolerancia vertical**: 100px maximos de deriva vertical antes de cancelar.
- **Retroalimentacion visual**: la tarjeta rota hasta 15 grados y muestra
  indicadores "Pasar" o "Me gusta" cuando se supera el umbral.

**Componente**: `src/ui/result/swipe-match-card.tsx`
**Hook**: `src/ui/shared/use-swipe-gesture.ts`

### Transiciones de pagina

Las transiciones entre pantallas usan animaciones CSS con `steps()` para
mantener la estetica pixel-art:

- `zm-page-enter`: entrada suave desde abajo (240ms).
- `zm-page-slide-in`: entrada lateral desde la derecha (240ms).

### Optimizacion de viewport

El layout principal incluye una meta tag de viewport que previene el zoom
accidental en inputs (iOS Safari) manteniendo accesibilidad:

```
width=device-width, initial-scale=1, maximum-scale=5
```

**Componente**: `src/ui/shared/viewport-meta.ts`

### Pull-to-refresh

La vista de resultado soporta "jalar para actualizar" en la parte superior:

- **Umbral**: 80px de desplazamiento vertical hacia abajo.
- **Resistencia**: factor de 0.5x (mientras mas jalas, mas resistencia).
- **Indicador**: spinner pixel-art con el token `--zm-gold`.
- **Estados**: idle → pulling → ready → refreshing → idle.

**Hook**: `src/ui/shared/use-pull-to-refresh.ts`

### Retroalimentacion tactil

Todos los botones interactivos tienen una animacion de escala al presionar:

```css
.zm-touch-press:active {
  transform: scale(0.96);
}
```

Esto se aplica automaticamente a traves de la clase `zm-touch-press`.

### Carga diferida (lazy loading)

Los componentes pesados se cargan de forma diferida con `next/dynamic`:

- **ConstellationSection**: el canvas de fisica y sprites (la parte mas
  pesada de la vista de resultado).
- **Chat**: las vistas de conversacion se cargan bajo demanda.

---

## Fase 4: Estado de animo ("Hoy me siento...")

### Descripcion

Un selector de estado de animo en la pagina de perfil que permite a la persona
expresar como se siente en el momento. El estado es opcional y puede ocultarse
de los matches.

### Opciones de animo

Seis estados disponibles, cada uno con etiqueta y descripcion en espanol:

| Clave                  | Etiqueta              | Descripcion                           |
|------------------------|-----------------------|---------------------------------------|
| `cansancio`            | Cansancio             | Un dia pesado, me cuesta arrancar     |
| `ansiedad`             | Ansiedad              | La mente no para, necesito calma      |
| `ganas_de_platikar`    | Ganas de platicar     | Tengo energia para conversar          |
| `necesito_un_abrazo`   | Necesito un abrazo    | Un poco de carino cae bien            |
| `alegria`              | Alegria               | Hoy me siento de buenas               |
| `concentracion`        | Concentracion         | Enfocado, modo estudio                |

### Privacidad

- El estado es **opcional**: la persona puede no elegir ninguno.
- Toggle de visibilidad: "Mostrar estado en mis matches".
- Cuando esta oculto, el icono no aparece en las tarjetas de match.

### Integracion con el sistema de animo

El estado publicado se usa como contexto para la seleccion de mensajes del
animalito. Cuando la persona tiene un animo publicado, el selector de mensajes
(`pickAnimoMessage`) prioriza mensajes de la categoria `animo_publicado` que
coincidan con el estado actual.

**Dominio**: `src/domain/status/status-types.ts`
**UI**: `src/ui/status/status-picker.tsx`
**Iconos**: `src/ui/status/status-icons.tsx`

### Icono en tarjetas de match

Cuando un match tiene un estado visible, se muestra una pequena etiqueta con
el icono pixel-art del animo junto al nombre:

```html
<span class="zm-status-badge">
  <svg class="zm-status-badge__icon">...</svg>
  <span>Alegria</span>
</span>
```

---

## Fase 5: Sistema de insignias

### Descripcion

Un sistema de logros que reconoce hitos en la experiencia de ZooMatch. Las
insignias se muestran en una cuadricula en la pagina de perfil.

> **Estado medido (2026-11-10):** la cuadricula **ya se monta**. vive en «Tu carta»
> (`src/ui/profile/profile-view.tsx` renderiza `src/ui/badges/badge-grid.tsx` despues de
> las afinidades) y su estado se **deriva en la lectura**: `src/application/profile-badges.ts`
> cuenta renglones que la app ya guarda (`matches`, `conversation_rounds`,
> `conversation_answers`, `conversation_messages`, `conversations.seen_*`/`last_actor`,
> `quiz_attempts`) y `ProfileDto` trae solo **ids** (`unlockedBadges: string[] | null`).
> No hay tabla de logros y no hace falta: no hubo migracion ni escritura de datos de
> personas. Dos cosas que el disenio de esta fase prometia y que **hoy no existen**,
> escritas a proposito en `docs/INSIGNIAS.md` §5: la **fecha** de desbloqueo (ninguna
> columna guarda el dia de un logro) y la **animacion** de "acabas de ganar" (viviria de
> esa misma fecha). Si la lectura de insignias falla, la seccion no aparece: `null`, no
> un cero. Montado y medido en ADR-066 (T-43); la mitad persistida sigue abierta en M-14.

### Insignias iniciales (6)

| ID                       | Nombre                | Condicion                              |
|--------------------------|-----------------------|----------------------------------------|
| `primer_match`           | Primer match          | Al menos 1 match en el cielo           |
| `conversacion_completada`| Primera conversacion  | 1 ronda contestada por las dos personas (o pasando) |
| `tres_rondas`            | Tres rondas           | Llegar a 3 rondas en una conversacion  |
| `chat_libre`             | Chat libre            | Desbloquear el chat libre              |
| `semana_activa`          | Semana activa         | Acumular 7 dias activos (no seguidos)  |
| `tres_rompehielos`       | Tres rompehielos      | Completar 3 quizzes (agregado, sin categoria) |

El catalogo vive en `data/badges.json` (antes estaba escrito en TypeScript) y su copy se
barre con el resto de la interfaz. `conversacion_completada` y `tres_rondas` miden cosas
distintas a proposito: la primera exige las dos marcas; la segunda cuenta la conversacion
que mas lejos llego, incluido lo que se revelo por el reloj de 48 h.

### Cuadricula de insignias

Las insignias se muestran en una cuadricula responsiva:

```css
grid-template-columns: repeat(auto-fill, minmax(calc(var(--zm-px) * 28), 1fr));
```

- **Desbloqueadas**: borde dorado (`--zm-gold`), icono visible.
- **Bloqueadas**: borde gris (`--zm-grid`), opacidad 0.5, icono atenuado.
- Cada celda es un `listitem` con nombre accesible "Nombre: Desbloqueado/Bloqueado": el
  estado no se comunica solo por color, y seis celdas estaticas no son seis regiones vivas.

### Animacion de desbloqueo

**No existe, y no puede existir mientras el estado sea derivado.** La animacion que pidio
el disenio (`@keyframes zm-badge-unlock`, 360 ms con `steps()`) necesitaba saber **el
momento** del desbloqueo, y ninguna columna guarda el dia de un logro. El CSS que lo
definia (`.zm-badge--unlocking`, `.zm-badge__flash` y sus dos `keyframes`, mas sus dos
lineas en `prefers-reduced-motion`) no lo emitia nadie y se borro en este cambio: dejar
reglas muertas es dejar en pie una promesa que la app no puede cumplir. Lo unico que se
mueve hoy en una celda es la transicion de `transform` al tocarla (`--zm-dur-tap`).

La mitad persistida de M-14 —un catalogo con su fecha— es lo unico que podria convertir
esta seccion en producto; hasta entonces, `docs/INSIGNIAS.md` §5 explica el silencio.

**Dominio**: `src/domain/badges/badge-types.ts`, `src/domain/badges/badge-catalog.ts`,
`src/domain/badges/badge-progress.ts`
**Config**: `data/badges.json`, `src/config/badges.ts`
**Lectura**: `src/application/profile-badges.ts`
**UI**: `src/ui/badges/badge-grid.tsx`

---

## Fase 6: Pruebas

### Cobertura de pruebas

- **Badge system**: `src/domain/badges/badge-types.test.ts`,
  `src/domain/badges/badge-progress.test.ts`, `src/config/badges.test.ts`,
  `src/application/profile-badges.test.ts`
  - Catalogo tiene 6 insignias con IDs unicos **y con iconos unicos** (la cuadricula se lee
    por forma, no por posicion).
  - Copy sin palabras prohibidas, sin emojis y sin prometer racha; presupuesto de
    `docs/QUIZZES.md` §5.3 vigilado tambien por Zod al cargar el config.
  - Condiciones de desbloqueo, y la aritmetica que las alimenta: `max` de rondas (no suma),
    dias distintos en la zona de la persona, ventana inclusiva por un milisegundo y
    monotonicidad del conjunto de ids.
  - Camino de lectura: `null` con la lectura rota, respuestas sin cuerpos, mensajes solo por
    su sello, y el tope de 200 que solo puede subestimar los dias activos.

- **Status/Animo integration**: `src/domain/status/status-types.test.ts`
  - Copy sin palabras prohibidas ni emojis.
  - Cada animo tiene su correspondiente opcion de estado.
  - Los estados coinciden con el enum `ANIMO_PUBLICADO`.

- **Swipe gesture logic**: `src/ui/shared/use-swipe-gesture.test.ts`
  - Deteccion de direccion (izquierda/derecha).
  - Calculo de rotacion con limites.
  - Visibilidad de indicadores.

- **Pull-to-refresh logic**: `src/ui/shared/use-pull-to-refresh.test.ts`
  - Resistencia al jalar.
  - Umbral de actualizacion.
  - Estado de reposo.

- **Mobile CSS validation**: `src/ui/shared/mobile-css.test.ts`
  - Sin patrones prohibidos (legacy palette, emojis, blur, radii).
  - Uso correcto de tokens de diseno.
  - Respeta `prefers-reduced-motion`.

### Ejecutar pruebas

```bash
npm run test
# o especifico:
npx vitest run src/domain/badges src/domain/status src/ui/shared
```

---

## Fase 7: Documentacion

### Componentes nuevos

| Componente              | Ruta                                        | Descripcion                          |
|-------------------------|---------------------------------------------|--------------------------------------|
| `SwipeMatchCard`        | `src/ui/result/swipe-match-card.tsx`        | Tarjeta con gestos de deslizamiento  |
| `StatusPicker`          | `src/ui/status/status-picker.tsx`           | Selector de estado de animo          |
| `StatusBadge`           | `src/ui/status/status-picker.tsx`           | Insignia de estado en tarjetas       |
| `StatusIconSvg`         | `src/ui/status/status-icons.tsx`            | Iconos pixel-art para animos         |
| `BadgeGrid`             | `src/ui/badges/badge-grid.tsx`              | Cuadricula de insignias              |

### Hooks nuevos

| Hook                    | Ruta                                        | Descripcion                          |
|-------------------------|---------------------------------------------|--------------------------------------|
| `useSwipeGesture`       | `src/ui/shared/use-swipe-gesture.ts`        | Deteccion de gestos de deslizamiento |
| `usePullToRefresh`      | `src/ui/shared/use-pull-to-refresh.ts`      | Jalar para actualizar                |

### Archivos CSS nuevos

| Archivo                 | Descripcion                                  |
|-------------------------|----------------------------------------------|
| `src/app/mobile.css`    | Estilos para gestos, transiciones, status, insignias |

### Galerias de desarrollo

Los nuevos componentes pueden verse en la galeria de desarrollo:

```
/dev/ui
```

La galeria muestra todos los estados de los componentes, incluyendo:
- Tarjetas con gestos de deslizamiento (simulados con botones).
- Selector de estado de animo con las 6 opciones.
- Cuadricula de insignias con estados bloqueado/desbloqueado.

---

## Accesibilidad (WCAG 2.1 AA)

### Objetivos tactiles

Todos los elementos interactivos tienen un minimo de 44x44px (`--zm-touch`).

### Navegacion por teclado

- Los selectores de estado usan `role="radiogroup"` y `role="radio"`.
- El toggle de privacidad usa `role="switch"`.
- Las insignias son una `list` de `listitem` con `aria-label` "Nombre: Desbloqueado" o
  "Nombre: Bloqueado". Antes cada celda llevaba `role="status"`, que es una region viva:
  seis celdas estaticas habrian sido seis regiones anunciandose solas.
- Los gestos de deslizamiento tienen botones alternativos para teclado.

### Movimiento reducido

Todas las animaciones respetan `@media (prefers-reduced-motion: reduce)`:
- Las transiciones de pagina se desactivan.
- El spinner de pull-to-refresh usa `border-style: dotted` estatico.

### Contraste

Los colores de las insignias y estados usan tokens del sistema de diseno que
ya cumplen WCAG AA:
- `--zm-gold` sobre `--zm-sky`: ratio > 4.5:1 en ambos temas.
- `--zm-fg-muted` para texto secundario: ratio > 4.5:1.

---

## Rendimiento

### Lazy loading

Los componentes pesados se cargan bajo demanda:

```typescript
const ConstellationSection = dynamic(
  () => import("@/ui/constellation/ConstellationSection"),
  { ssr: false, loading: () => <LoadingState /> }
);
```

### Optimizaciones CSS

- Las animaciones usan `will-change: transform` solo en elementos que se
  transforman frecuentemente (tarjetas de swipe).
- Las transiciones usan `steps()` en lugar de curvas suaves para mantener
  la estetica pixel-art y reducir costo de renderizado.
- Los iconos de estado son SVG inline, sin peticiones adicionales.

### Metricas objetivo

- Lighthouse Performance: > 90 en movil.
- Lighthouse Accessibility: > 95.
- First Contentful Paint: < 2s.
- Largest Contentful Paint: < 2.5s.
- Cumulative Layout Shift: < 0.1.

---

## Patrones de gesto

### Deslizamiento horizontal (swipe)

**Uso**: Tarjetas de match en la vista de resultado.

**Comportamiento**:
1. El usuario toca la tarjeta y arrastra horizontalmente.
2. La tarjeta rota proporcionalmente al desplazamiento (max 15 grados).
3. Aparecen indicadores "Pasar" o "Me gusta" cuando se supera el umbral.
4. Al soltar, si se supero el umbral (80px), la tarjeta sale animada.
5. Si no se supero el umbral, la tarjeta vuelve a su posicion original.

**Alternativa para teclado**: Botones "Me gusta" y "Pasar" visibles en desktop.

### Jalar para actualizar (pull-to-refresh)

**Uso**: Vista de resultado.

**Comportamiento**:
1. El usuario esta en la parte superior de la lista (scrollTop = 0).
2. Arrastra hacia abajo.
3. Aparece un indicador con spinner.
4. Si supera el umbral (80px), el indicador cambia a "listo".
5. Al soltar, se ejecuta la actualizacion.
6. El indicador se oculta cuando termina.

**Alternativa**: Boton "Reintentar" visible en todo momento.

### Presion tactil (touch feedback)

**Uso**: Todos los botones y elementos interactivos.

**Comportamiento**:
1. Al presionar (`:active`), el elemento se escala a 96%.
2. Al soltar, vuelve a 100% con una transicion de 120ms.
3. Usa `steps(1)` para un efecto pixel-art (sin interpolacion suave).

---

## Ejemplos de uso

### Agregar gestos de deslizamiento a una tarjeta

```tsx
import { SwipeMatchCard } from "@/ui/result/swipe-match-card";

function MatchList({ matches }) {
  return (
    <div>
      {matches.map((match) => (
        <SwipeMatchCard
          key={match.id}
          onLike={() => handleLike(match.id)}
          onPass={() => handlePass(match.id)}
        >
          <MatchCardContent match={match} />
        </SwipeMatchCard>
      ))}
    </div>
  );
}
```

### Agregar el selector de estado al perfil

```tsx
import { StatusPicker } from "@/ui/status/status-picker";
import type { AnimoPublicado } from "@/config/animo";

function ProfilePage() {
  const [animo, setAnimo] = useState<AnimoPublicado | null>(null);
  const [visible, setVisible] = useState(true);

  return (
    <StatusPicker
      value={animo}
      visible={visible}
      onChange={setAnimo}
      onVisibilityChange={setVisible}
    />
  );
}
```

### Mostrar insignias en el perfil

Asi esta montado de verdad (`src/ui/profile/profile-view.tsx`, despues de las afinidades):

```tsx
import { BadgeGrid } from "@/ui/badges/badge-grid";

{profile.unlockedBadges ? <BadgeGrid unlocked={profile.unlockedBadges} /> : null}
```

El prop es una lista de **ids**, no de objetos: la pantalla pone los nombres, las lineas y
los iconos desde `data/badges.json`. `null` (lectura fallada) no pinta la seccion; `[]` si
la pinta con su pista vacia. Ya no existen `BadgeDisplay`, `justUnlocked` ni el prop
`badges` del boceto original de esta fase.

### Mostrar estado en una tarjeta de match

```tsx
import { StatusBadge } from "@/ui/status/status-picker";
import type { AnimoPublicado } from "@/config/animo";

function MatchCard({ match, animo }: { match: MatchDto; animo: AnimoPublicado | null }) {
  return (
    <article>
      <h3>{match.name}</h3>
      {animo && <StatusBadge animo={animo} />}
      {/* ... resto del contenido ... */}
    </article>
  );
}
```
