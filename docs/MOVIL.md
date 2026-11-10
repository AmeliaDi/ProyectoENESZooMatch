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

> **Estado medido (2026-11-10):** esa frase describe el diseño, no lo que hay.
> La cuadricula existe como componente (`src/ui/badges/badge-grid.tsx`) y esta
> probada su logica (`src/domain/badges/badge-types.test.ts`), pero ninguna
> pantalla lo monta, `ProfileDto` no trae insignias y no hay tabla de logros en la
> base: nadie puede haber ganado una todavia. Montarla es la primera mitad de M-14
> en `docs/PENDIENTES_MANUALES.md` (ADR-062).

### Insignias iniciales (5)

| ID                       | Nombre                | Condicion                              |
|--------------------------|-----------------------|----------------------------------------|
| `primer_match`           | Primer match          | Al menos 1 match en el cielo           |
| `conversacion_completada`| Primera conversacion  | Completar 1 ronda de preguntas         |
| `tres_rondas`            | Tres rondas           | Llegar a 3 rondas en una conversacion  |
| `chat_libre`             | Chat libre            | Desbloquear el chat libre              |
| `semana_activa`          | Semana activa         | Acumular 7 dias activos (no seguidos)  |

### Cuadricula de insignias

Las insignias se muestran en una cuadricula responsiva:

```css
grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
```

- **Desbloqueadas**: borde dorado (`--zm-gold`), icono visible.
- **Bloqueadas**: borde gris (`--zm-grid`), opacidad 0.5, icono atenuado.

### Animacion de desbloqueo

Cuando una insignia se desbloquea, se reproduce una animacion CSS:

```css
@keyframes zm-badge-unlock {
  0%   { transform: scale(0.8); opacity: 0; }
  25%  { transform: scale(1.1); opacity: 1; }
  50%  { transform: scale(0.95); }
  75%  { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
```

Duracion: 360ms (`--zm-dur-emphasis`), con `steps()` para el efecto pixel.

**Dominio**: `src/domain/badges/badge-types.ts`, `src/domain/badges/badge-catalog.ts`
**UI**: `src/ui/badges/badge-grid.tsx`

---

## Fase 6: Pruebas

### Cobertura de pruebas

- **Badge system**: `src/domain/badges/badge-types.test.ts`
  - Catalogo tiene 5 insignias con IDs unicos.
  - Copy sin palabras prohibidas ni emojis.
  - Condiciones de desbloqueo funcionan correctamente.

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
- Las insignias usan `role="status"` con `aria-label` descriptivo.
- Los gestos de deslizamiento tienen botones alternativos para teclado.

### Movimiento reducido

Todas las animaciones respetan `@media (prefers-reduced-motion: reduce)`:
- Las animaciones de desbloqueo de insignias se desactivan.
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

```tsx
import { BadgeGrid } from "@/ui/badges/badge-grid";
import type { BadgeDisplay } from "@/domain/badges/badge-types";

function ProfilePage({ badges }: { badges: BadgeDisplay[] }) {
  return (
    <BadgeGrid
      badges={badges}
      justUnlocked={null}
    />
  );
}
```

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
