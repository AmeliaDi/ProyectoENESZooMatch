"use client";

/**
 * ZooMatch — Galería de sprites (sólo desarrollo)
 * ─────────────────────────────────────────────────────────────────────────────
 * Visor del catálogo completo de animalitos pixeleados que produce el motor
 * determinista `src/lib/pixel-sprites.ts`. Esta pieza NO toca el motor: sólo lo
 * consume (`getSpriteFrame`, `getAnimalFamily`, `getAllColorIds`, `GRID_SIZE`)
 * y lo dibuja como SVG (`<rect>` por celda, `shape-rendering: crispEdges`).
 *
 * Todo el copy visible está en es-MX, cálido e inclusivo.
 */

import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import catalogoData from "../../data/catalogo_arquetipos_v2.json";
import arquetiposV1 from "../../data/arquetipos.json";
import {
  ALL_FAMILIES,
  GRID_SIZE,
  getAnimalFamily,
  getAllColorIds,
  getSpriteFrame,
  type AnimationFrame,
  type ShapeFamily,
  type SpriteData,
} from "@/lib/pixel-sprites";

// ─── Formas de los catálogos (sólo lectura) ────────────────────────────────────

interface CatalogAnimal {
  id: string;
  nombre_fuente: string;
  diminutivo_es: string;
  categoria_fauna: string;
}

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
  textura: string;
  temperatura: string;
}

interface V1Archetype {
  id: string;
  codigo_mbti: string;
  animal: { nombre_fuente: string; diminutivo_es: string };
  color_principal: { nombre: string; hex: string };
}

const ANIMALS = catalogoData.animales as unknown as CatalogAnimal[];
const COLORS = catalogoData.colores as unknown as CatalogColor[];
const V1_ARCHETYPES = arquetiposV1.arquetipos as unknown as V1Archetype[];

// ─── Utilidades puras ──────────────────────────────────────────────────────────

/** Normaliza para búsquedas: sin acentos y en minúsculas. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Distancia RGB² entre dos hex; menor = más parecidos. */
function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

/** Encuentra el id del color de catálogo más parecido a un hex dado. */
function nearestColorId(hex: string): string {
  let best = COLORS[0].id;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of COLORS) {
    const distance = colorDistance(color.hex, hex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color.id;
    }
  }
  return best;
}

/** Genera un sprite sin dejar que un fallo tumbe toda la galería. */
function safeSprite(
  animalId: string,
  colorId: string,
  frame: AnimationFrame,
): SpriteData | null {
  try {
    return getSpriteFrame(animalId, colorId, frame);
  } catch {
    return null;
  }
}

// ─── Datos derivados (una sola vez, al cargar el módulo) ───────────────────────

const COLOR_MAP = new Map<string, CatalogColor>(COLORS.map((c) => [c.id, c]));
const ALL_COLOR_IDS = getAllColorIds();
const COLOR_TOTAL = ALL_COLOR_IDS.length;

interface AnimalEntry {
  id: string;
  diminutivo: string;
  nombre: string;
  etiqueta: string;
  family: ShapeFamily;
  /** Color fijo: sólo los arquetipos v1 lo llevan (su color principal). */
  fixedColorId?: string;
  needle: string;
}

function buildNeedle(
  family: ShapeFamily,
  ...parts: (string | undefined)[]
): string {
  return norm([family, ...parts].filter(Boolean).join(" "));
}

const V2_LIST: AnimalEntry[] = ANIMALS.map((animal) => {
  const family = getAnimalFamily(animal.id);
  return {
    id: animal.id,
    diminutivo: animal.diminutivo_es,
    nombre: animal.nombre_fuente,
    etiqueta: animal.categoria_fauna,
    family,
    needle: buildNeedle(
      family,
      animal.diminutivo_es,
      animal.nombre_fuente,
      animal.categoria_fauna,
      animal.id,
    ),
  };
});

const V1_LIST: AnimalEntry[] = V1_ARCHETYPES.map((archetype) => {
  const family = getAnimalFamily(archetype.id);
  return {
    id: archetype.id,
    diminutivo: archetype.animal.diminutivo_es,
    nombre: archetype.animal.nombre_fuente,
    etiqueta: archetype.codigo_mbti,
    family,
    fixedColorId: nearestColorId(archetype.color_principal.hex),
    needle: buildNeedle(
      family,
      archetype.animal.diminutivo_es,
      archetype.animal.nombre_fuente,
      archetype.codigo_mbti,
      archetype.id,
    ),
  };
});

const ANIMAL_TOTAL = V2_LIST.length + V1_LIST.length;

// ─── Fondos del escenario ────────────────────────────────────────────────────

type BgMode = "claro" | "oscuro" | "cuadriculado";

const BG_STYLES: Record<BgMode, CSSProperties> = {
  claro: { backgroundColor: "#f0eadb" },
  oscuro: { backgroundColor: "#17231d" },
  cuadriculado: {
    backgroundImage:
      "conic-gradient(#d7d0be 0.25turn, #f2ecdd 0.25turn 0.5turn, #d7d0be 0.5turn 0.75turn, #f2ecdd 0.75turn)",
    backgroundSize: "16px 16px",
  },
};

const SCALE_PX = { 1: 48, 2: 96 } as const;
type Scale = keyof typeof SCALE_PX;

// ─── Sprite SVG (memoizado por animalId + colorId + frame + px) ────────────────

interface SpriteViewProps {
  animalId: string;
  colorId: string;
  frame: AnimationFrame;
  px: number;
  label: string;
}

const SpriteView = memo(function SpriteView({
  animalId,
  colorId,
  frame,
  px,
  label,
}: SpriteViewProps) {
  const sprite = useMemo(
    () => safeSprite(animalId, colorId, frame),
    [animalId, colorId, frame],
  );

  if (!sprite) {
    return (
      <span
        className="grid place-items-center font-mono text-[0.6rem] text-clay"
        style={{ width: px, height: px }}
        aria-hidden="true"
      >
        !
      </span>
    );
  }

  const cell = px / GRID_SIZE;
  const cells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const hex = sprite.grid[r][c];
      if (!hex) continue;
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={c * cell}
          y={r * cell}
          width={cell}
          height={cell}
          fill={hex}
        />,
      );
    }
  }

  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      role="img"
      aria-label={label}
      style={{ shapeRendering: "crispEdges", display: "block" }}
    >
      <title>{label}</title>
      {cells}
    </svg>
  );
});

// ─── Tarjeta de animalito ──────────────────────────────────────────────────────

interface SpriteCardProps {
  entry: AnimalEntry;
  colorId: string;
  colorName: string;
  px: number;
  bgStyle: CSSProperties;
  animate: boolean;
  blink: boolean;
  index: number;
}

function SpriteCard({
  entry,
  colorId,
  colorName,
  px,
  bgStyle,
  animate,
  blink,
  index,
}: SpriteCardProps) {
  const [hover, setHover] = useState(false);

  const frame: AnimationFrame =
    hover && animate ? "happy" : animate && blink ? "idle_2" : "idle_1";

  const cardLabel = `${entry.diminutivo}, color ${colorName}`;
  const spriteLabel = `${entry.diminutivo} (${entry.nombre}), sprite pixelado en ${colorName}, familia ${entry.family}`;

  return (
    <figure
      className="specimen-card admin-reveal group flex flex-col items-center gap-2 rounded-xl border border-ink/12 bg-paper/50 p-3 outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      style={{ animationDelay: `${Math.min(index, 24) * 22}ms` }}
      tabIndex={0}
      aria-label={cardLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div
        className="grid place-items-center rounded-lg transition-colors duration-300"
        style={{ ...bgStyle, width: px + 20, height: px + 20 }}
      >
        <SpriteView
          animalId={entry.id}
          colorId={colorId}
          frame={frame}
          px={px}
          label={spriteLabel}
        />
      </div>
      <figcaption className="flex w-full flex-col items-center gap-0.5 text-center">
        <span className="font-display text-[0.82rem] font-semibold capitalize leading-tight text-ink">
          {entry.diminutivo}
        </span>
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-leaf">
          {entry.etiqueta} · {entry.family}
        </span>
      </figcaption>
    </figure>
  );
}

// ─── Controles reutilizables ───────────────────────────────────────────────────

interface SegmentedProps {
  legend: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

function Segmented({ legend, options, value, onChange }: SegmentedProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-leaf">
        {legend}
      </span>
      <div
        className="inline-flex rounded-full border border-ink/15 bg-paper/60 p-0.5"
        role="group"
        aria-label={legend}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`rounded-full px-3 py-1 text-[0.72rem] font-semibold transition-colors ${
                active
                  ? "bg-moss text-paper"
                  : "text-ink/70 hover:bg-ink/5 hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function SpriteGallery() {
  const [query, setQuery] = useState("");
  const [colorId, setColorId] = useState<string>(ALL_COLOR_IDS[0]);
  const [bg, setBg] = useState<BgMode>("claro");
  const [scale, setScale] = useState<Scale>(2);
  const [animate, setAnimate] = useState(true);
  const [blink, setBlink] = useState(false);

  // prefers-reduced-motion apaga el parpadeo automático. `useReducedMotion` se
  // suscribe de forma segura durante SSR e hidratación, así no hay setState
  // síncrono dentro de un efecto.
  const reducedMotion = useReducedMotion();
  const motionOn = animate && !reducedMotion;
  const effectiveBlink = motionOn && blink;

  // Un único temporizador compartido para TODA la cuadrícula (no uno por sprite).
  // El setState vive dentro del callback del intervalo, nunca en el cuerpo del
  // efecto, para no provocar renders en cascada.
  useEffect(() => {
    if (!motionOn) return;
    const id = window.setInterval(() => setBlink((b) => !b), 600);
    return () => window.clearInterval(id);
  }, [motionOn]);

  const needle = norm(query);

  const matches = useCallback(
    (entry: AnimalEntry) => needle === "" || entry.needle.includes(needle),
    [needle],
  );

  const visibleV2 = useMemo(() => V2_LIST.filter(matches), [matches]);
  const visibleV1 = useMemo(() => V1_LIST.filter(matches), [matches]);

  const px = SCALE_PX[scale];
  const activeColor = COLOR_MAP.get(colorId);
  const bgStyle = BG_STYLES[bg];

  /** Pares (animal, color) actualmente visibles — alimenta auditoría y export. */
  const visibleItems = useMemo(
    () => [
      ...visibleV2.map((entry) => ({ animalId: entry.id, colorId })),
      ...visibleV1.map((entry) => ({
        animalId: entry.id,
        colorId: entry.fixedColorId ?? colorId,
      })),
    ],
    [visibleV2, visibleV1, colorId],
  );

  // Auditoría: fallos de generación + colisiones de grid idéntico entre visibles.
  const audit = useMemo(() => {
    const errors: string[] = [];
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const item of visibleItems) {
      const sprite = safeSprite(item.animalId, item.colorId, "idle_1");
      if (!sprite) {
        errors.push(item.animalId);
        continue;
      }
      const signature = sprite.grid.flat().join("|");
      const previous = seen.get(signature);
      if (previous) {
        collisions.push(`${previous} ↔ ${item.animalId}`);
      } else {
        seen.set(signature, item.animalId);
      }
    }

    return { errors, collisions };
  }, [visibleItems]);

  const pickRandomColor = useCallback(() => {
    const next = ALL_COLOR_IDS[Math.floor(Math.random() * ALL_COLOR_IDS.length)];
    setColorId(next);
  }, []);

  const exportSheet = useCallback(() => {
    if (typeof document === "undefined" || visibleItems.length === 0) return;

    const cell = 8;
    const spritePx = GRID_SIZE * cell;
    const pad = 12;
    const cols = Math.max(1, Math.ceil(Math.sqrt(visibleItems.length)));
    const rows = Math.ceil(visibleItems.length / cols);

    const canvas = document.createElement("canvas");
    canvas.width = cols * spritePx + (cols + 1) * pad;
    canvas.height = rows * spritePx + (rows + 1) * pad;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    visibleItems.forEach((item, i) => {
      const sprite = safeSprite(item.animalId, item.colorId, "idle_1");
      if (!sprite) return;
      const ox = pad + (i % cols) * (spritePx + pad);
      const oy = pad + Math.floor(i / cols) * (spritePx + pad);
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const hex = sprite.grid[r][c];
          if (!hex) continue;
          ctx.fillStyle = hex;
          ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
        }
      }
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `zoomatch-sprites-${visibleItems.length}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [visibleItems]);

  const hasAlert = audit.errors.length > 0 || audit.collisions.length > 0;

  return (
    <div className="public-shell min-h-screen text-ink">
      <div className="grain" aria-hidden="true" />

      <div className="relative z-20 mx-auto max-w-[110rem] px-4 pb-24 sm:px-6 lg:px-10">
        {/* ── Encabezado ─────────────────────────────────────────────── */}
        <header className="flex flex-col gap-5 border-b border-ink/15 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <p className="eyebrow">ZooMatch · modo desarrollo</p>
              <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
                Galería de sprites
              </h1>
              <p className="max-w-xl text-sm text-ink/70">
                Todos los animalitos que genera el motor pixelado, en vivo.
                Cambia el color, el fondo o el tamaño para revisar que cada
                criatura se lea bien donde vaya a vivir.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-ink/20 px-4 py-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ink/70 transition-colors hover:border-clay hover:text-clay"
            >
              ← volver
            </Link>
          </div>

          {/* Contador en vivo */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="font-display text-lg font-semibold text-clay">
              {visibleV2.length} animalitos × {COLOR_TOTAL} colores
            </p>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-leaf">
              {visibleItems.length} sprites en pantalla · {ANIMAL_TOTAL} en el
              catálogo · {ALL_FAMILIES.length} familias
            </p>
          </div>
        </header>

        {/* ── Barra de controles ─────────────────────────────────────── */}
        <section
          aria-label="Controles de la galería"
          className="sticky top-0 z-30 -mx-4 mt-4 border-b border-ink/15 bg-paper/85 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* Buscador */}
              <label className="flex min-w-[15rem] flex-1 flex-col gap-1.5">
                <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-leaf">
                  Buscar
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="p. ej. gatito, ave, marino, INTJ…"
                  className="w-full rounded-full border border-ink/20 bg-paper/70 px-4 py-2 text-sm text-ink placeholder:text-ink/40 outline-none focus:border-clay focus:ring-2 focus:ring-clay/40"
                />
              </label>

              <Segmented
                legend="Fondo"
                value={bg}
                onChange={(value) => setBg(value as BgMode)}
                options={[
                  { value: "claro", label: "claro" },
                  { value: "oscuro", label: "oscuro" },
                  { value: "cuadriculado", label: "cuadriculado" },
                ]}
              />

              <Segmented
                legend="Tamaño"
                value={String(scale)}
                onChange={(value) => setScale(Number(value) as Scale)}
                options={[
                  { value: "1", label: "1× · 48px" },
                  { value: "2", label: "2× · 96px" },
                ]}
              />

              {/* Animación */}
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-leaf">
                  Animación
                </span>
                <button
                  type="button"
                  aria-pressed={animate}
                  onClick={() => setAnimate((a) => !a)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                    animate
                      ? "border-clay bg-clay text-paper"
                      : "border-ink/20 bg-paper/60 text-ink/70 hover:border-clay/60"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      animate ? "bg-paper" : "bg-ink/40"
                    }`}
                    aria-hidden="true"
                  />
                  {animate ? "respirando" : "quietos"}
                </button>
              </div>

              {/* Exportar */}
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-leaf">
                  Exportar
                </span>
                <button
                  type="button"
                  onClick={exportSheet}
                  disabled={visibleItems.length === 0}
                  className="rounded-full border border-moss bg-moss px-4 py-1.5 text-[0.72rem] font-semibold text-paper transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                >
                  descargar PNG
                </button>
              </div>
            </div>

            {/* Selector de color / textura */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-leaf">
                  Color / textura ({COLOR_TOTAL})
                </span>
                <div className="flex items-center gap-3">
                  {activeColor ? (
                    <span className="font-mono text-[0.66rem] text-ink/70">
                      <span className="font-semibold text-ink">
                        {activeColor.nombre}
                      </span>{" "}
                      · {activeColor.hex} · {activeColor.textura} ·{" "}
                      {activeColor.temperatura}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={pickRandomColor}
                    className="rounded-full border border-clay/50 px-3 py-1 font-mono text-[0.64rem] uppercase tracking-[0.1em] text-clay transition-colors hover:bg-clay hover:text-paper"
                  >
                    color aleatorio
                  </button>
                </div>
              </div>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {COLORS.map((color) => {
                  const active = color.id === colorId;
                  return (
                    <button
                      key={color.id}
                      type="button"
                      aria-pressed={active}
                      title={`${color.nombre} · ${color.hex} · ${color.textura}`}
                      onClick={() => setColorId(color.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[0.68rem] transition-colors ${
                        active
                          ? "border-clay bg-clay/10 text-ink"
                          : "border-ink/15 bg-paper/50 text-ink/70 hover:border-ink/35"
                      }`}
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-ink/25"
                        style={{ backgroundColor: color.hex }}
                        aria-hidden="true"
                      />
                      {color.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── Banner de auditoría ────────────────────────────────────── */}
        <div aria-live="polite" className="mt-5">
          {hasAlert ? (
            <div className="rounded-xl border-2 border-clay bg-clay/10 px-4 py-3 text-sm text-ink">
              <p className="font-display font-semibold text-clay">
                ¡Ojo! Hay detalles que revisar en el motor:
              </p>
              {audit.errors.length > 0 ? (
                <p className="mt-1 font-mono text-[0.72rem] text-ink/80">
                  {audit.errors.length} sprite(s) no se pudieron generar:{" "}
                  {audit.errors.join(", ")}
                </p>
              ) : null}
              {audit.collisions.length > 0 ? (
                <p className="mt-1 font-mono text-[0.72rem] text-ink/80">
                  {audit.collisions.length} colisión(es) de grid idéntico:{" "}
                  {audit.collisions.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl border border-friendship-deep/30 bg-friendship/10 px-4 py-2 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-friendship-deep">
              todo distinto ✓ · {visibleItems.length} sprites únicos, sin
              colisiones
            </p>
          )}
        </div>

        {/* ── Cuadrícula v2 ──────────────────────────────────────────── */}
        <section aria-label="Animalitos del catálogo v2" className="mt-8">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">
              Catálogo v2
            </h2>
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-leaf">
              {visibleV2.length} de {V2_LIST.length} · color {activeColor?.nombre ?? colorId}
            </span>
          </div>

          {visibleV2.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink/20 px-4 py-8 text-center text-sm text-ink/60">
              Ningún animalito coincide con “{query}”. Prueba con otra palabra
              cariñosa.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
              {visibleV2.map((entry, index) => (
                <SpriteCard
                  key={entry.id}
                  entry={entry}
                  colorId={colorId}
                  colorName={activeColor?.nombre ?? colorId}
                  px={px}
                  bgStyle={bgStyle}
                  animate={animate}
                  blink={effectiveBlink}
                  index={index}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Sección v1 (arquetipos MBTI) ───────────────────────────── */}
        <section
          aria-label="Arquetipos v1 (MBTI)"
          className="mt-12 border-t border-ink/15 pt-8"
        >
          <div className="mb-1 flex flex-wrap items-baseline gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">
              Arquetipos v1 · MBTI
            </h2>
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-leaf">
              {visibleV1.length} de {V1_LIST.length}
            </span>
          </div>
          <p className="mb-4 max-w-2xl text-xs text-ink/60">
            Los 16 tipos MBTI de la primera versión. Cada uno se dibuja con el
            color de catálogo más cercano a su <code>color_principal</code>, así
            que ignoran el selector de color de arriba y conservan su paleta
            firma.
          </p>

          {visibleV1.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink/20 px-4 py-8 text-center text-sm text-ink/60">
              Ningún arquetipo coincide con “{query}”.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
              {visibleV1.map((entry, index) => {
                const fixedColorId = entry.fixedColorId ?? colorId;
                const fixedColor = COLOR_MAP.get(fixedColorId);
                return (
                  <SpriteCard
                    key={entry.id}
                    entry={entry}
                    colorId={fixedColorId}
                    colorName={fixedColor?.nombre ?? fixedColorId}
                    px={px}
                    bgStyle={bgStyle}
                    animate={animate}
                    blink={effectiveBlink}
                    index={index}
                  />
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-14 border-t border-ink/15 pt-6 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink/45">
          motor determinista · {GRID_SIZE}×{GRID_SIZE}px por sprite · ruta
          exclusiva de desarrollo
        </footer>
      </div>
    </div>
  );
}
