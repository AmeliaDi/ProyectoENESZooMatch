"use client";

/**
 * ZooMatch — Galería de sprites (sólo desarrollo)
 * ─────────────────────────────────────────────────────────────────────────────
 * Visor del catálogo completo de animalitos pixeleados que produce el motor
 * determinista `src/domain/avatars/pixel-sprites.ts`. Esta pieza NO toca el motor: sólo lo
 * consume (`getSpriteFrame`, `getAnimalFamily`, `getAllColorIds`, `GRID_SIZE`)
 * y lo dibuja como SVG (`<rect>` por celda, `shape-rendering: crispEdges`).
 *
 * Todo el copy visible está en es-MX, cálido e inclusivo.
 */

import { useReducedMotionPreference } from "@/ui/constellation/hooks";
import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import { CATALOG_ANIMALS, CATALOG_COLORS } from "@/config";
import type { ArchetypeAnimal } from "@/types/archetype";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { SharedHeart } from "@/ui/constellation/RomanceHearts";
import { deriveAnimalPsychometricProfile } from "@/domain/psychometrics/psychometrics";
import {
  ALL_FAMILIES,
  FAMILY_LABELS,
  GRID_SIZE,
  getAnimalFamily,
  getAllColorIds,
  getSpriteFrame,
  type AnimationFrame,
  type ShapeFamily,
  type SpriteData,
} from "@/domain/avatars/pixel-sprites";

// ─── Formas de los catálogos (sólo lectura) ────────────────────────────────────

interface CatalogColor {
  id: string;
  nombre: string;
  hex: string;
  textura: string;
  temperatura: string;
}

const ANIMALS: readonly ArchetypeAnimal[] = CATALOG_ANIMALS;
const COLORS: readonly CatalogColor[] = CATALOG_COLORS;

// ─── Utilidades puras ──────────────────────────────────────────────────────────

/** Normaliza para búsquedas: sin acentos y en minúsculas. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  enneagram: string;
  attachment: string;
  family: ShapeFamily;
  needle: string;
}

function buildNeedle(
  family: ShapeFamily,
  ...parts: (string | undefined)[]
): string {
  return norm([family, FAMILY_LABELS[family], ...parts].filter(Boolean).join(" "));
}

const ANIMALS_LIST: AnimalEntry[] = ANIMALS.map((animal) => {
  const family = getAnimalFamily(animal.id);
  const psychometrics = deriveAnimalPsychometricProfile(animal);
  return {
    id: animal.id,
    diminutivo: animal.diminutivo_es,
    nombre: animal.nombre_fuente,
    etiqueta: animal.categoria_fauna,
    family,
    enneagram: `${psychometrics.enneagram.code} · ${psychometrics.enneagram.arquetipo}`,
    attachment: psychometrics.attachment.label,
    needle: buildNeedle(
      family,
      animal.diminutivo_es,
      animal.nombre_fuente,
      animal.categoria_fauna,
      animal.id,
    ),
  };
});

const ANIMAL_TOTAL = ANIMALS_LIST.length;

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

/** The five animation states shown in the gallery strip. `romance_duo` is a
 * two-sprite composition, so it is rendered with `PixelAnimal` rather than a
 * single grid frame. */
const FRAME_PREVIEWS = [
  { key: "idle_1", label: "idle" },
  { key: "idle_2", label: "parpadeo" },
  { key: "happy", label: "feliz" },
  { key: "romance_pulse", label: "romance" },
  { key: "romance_duo", label: "dúo" },
] as const;

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
        className="grid place-items-center font-pixel text-[0.6rem] text-atlas-gold"
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
      const hex = sprite.grid[r]?.[c];
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
  showFrames: boolean;
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
  showFrames,
}: SpriteCardProps) {
  const [hover, setHover] = useState(false);

  const frame: AnimationFrame =
    hover && animate ? "happy" : animate && blink ? "idle_2" : "idle_1";

  const cardLabel = `${entry.diminutivo}, color ${colorName}`;
  const spriteLabel = `${entry.diminutivo} (${entry.nombre}), sprite pixelado en ${colorName}, familia ${FAMILY_LABELS[entry.family]}`;

  return (
    <figure
      className="group flex flex-col items-center gap-2 border border-atlas-grid bg-atlas-frame p-3 outline-none focus-visible:ring-2 focus-visible:ring-atlas-focus focus-visible:ring-offset-2 focus-visible:ring-offset-atlas-sky"
      style={{ animationDelay: `${Math.min(index, 24) * 22}ms` }}
      tabIndex={0}
      aria-label={cardLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div
        className="grid place-items-center transition-colors duration-300"
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
        <span className="font-pixel text-[0.82rem] font-semibold capitalize leading-tight text-atlas-fg">
          {entry.diminutivo}
        </span>
        <span className="font-pixel text-[0.58rem] uppercase tracking-[0.12em] text-atlas-gold">
          {entry.etiqueta} · {FAMILY_LABELS[entry.family]}
        </span>
        <span className="font-pixel text-[0.56rem] uppercase tracking-[0.1em] text-atlas-gold/80">
          {entry.enneagram} · {entry.attachment}
        </span>
      </figcaption>

      {showFrames ? (
        <div className="mt-1 grid w-full grid-cols-5 gap-1" aria-label={`Estados de ${entry.diminutivo}`}>
          {FRAME_PREVIEWS.map((preview) => (
            <div key={preview.key} className="flex flex-col items-center gap-0.5">
              <div className="grid h-8 w-full place-items-center border border-atlas-grid bg-atlas-frame">
                {preview.key === "romance_duo" ? (
                  <div className="flex items-center" aria-hidden="true">
                    <PixelAnimal animalId={entry.id} colorId={colorId} size={13} happy />
                    <SharedHeart size={7} animated={false} />
                    <div style={{ transform: "scaleX(-1)" }}>
                      <PixelAnimal animalId={entry.id} colorId={colorId} size={13} happy />
                    </div>
                  </div>
                ) : (
                  <PixelAnimal
                    animalId={entry.id}
                    colorId={colorId}
                    frame={preview.key}
                    size={26}
                    animated={false}
                  />
                )}
              </div>
              <span className="font-pixel text-[0.42rem] uppercase tracking-[0.06em] text-atlas-muted">
                {preview.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
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
      <span className="font-pixel text-[0.6rem] font-bold uppercase tracking-[0.16em] text-atlas-gold">
        {legend}
      </span>
      <div
        className="inline-flex border border-atlas-grid bg-atlas-frame p-0.5"
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
              className={` px-3 py-1 text-[0.72rem] font-semibold transition-colors ${
                active
                  ? "bg-atlas-raised text-atlas-on-gold"
                  : "text-atlas-muted hover:bg-atlas-raised hover:text-atlas-fg"
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
  const [colorId, setColorId] = useState<string>(ALL_COLOR_IDS[0] ?? "");
  const [bg, setBg] = useState<BgMode>("claro");
  const [scale, setScale] = useState<Scale>(2);
  const [animate, setAnimate] = useState(true);
  const [showFrames, setShowFrames] = useState(false);
  const [blink, setBlink] = useState(false);

  // prefers-reduced-motion apaga el parpadeo automático. El hook se
  // suscribe de forma segura durante SSR e hidratación, así no hay setState
  // síncrono dentro de un efecto.
  const reducedMotion = useReducedMotionPreference();
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

  const visibleAnimals = useMemo(() => ANIMALS_LIST.filter(matches), [matches]);

  const px = SCALE_PX[scale];
  const activeColor = COLOR_MAP.get(colorId);
  const bgStyle = BG_STYLES[bg];

  /** Pares (animal, color) actualmente visibles — alimenta auditoría y export. */
  const visibleItems = useMemo(
    () => visibleAnimals.map((entry) => ({ animalId: entry.id, colorId })),
    [visibleAnimals, colorId],
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
    if (next !== undefined) setColorId(next);
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
          const hex = sprite.grid[r]?.[c];
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
    <div className="zm-root min-h-screen bg-atlas-sky text-atlas-fg">

      <div className="relative z-20 mx-auto max-w-[110rem] px-4 pb-24 sm:px-6 lg:px-10">
        {/* ── Encabezado ─────────────────────────────────────────────── */}
        <header className="flex flex-col gap-5 border-b border-atlas-grid py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <p className="eyebrow">ZooMatch · modo desarrollo</p>
              <h1 className="font-pixel text-3xl font-semibold tracking-[-0.03em] text-atlas-fg sm:text-4xl">
                Galería de sprites
              </h1>
              <p className="max-w-xl text-sm text-atlas-muted">
                Todos los animalitos que genera el motor pixelado, en vivo.
                Cambia el color, el fondo o el tamaño para revisar que cada
                criatura se lea bien donde vaya a vivir.
              </p>
            </div>
            <Link
              href="/"
              className="border border-atlas-grid px-4 py-2 font-pixel text-[0.68rem] uppercase tracking-[0.14em] text-atlas-muted transition-colors hover:border-atlas-gold hover:text-atlas-gold"
            >
              ← volver
            </Link>
          </div>

          {/* Contador en vivo */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="font-pixel text-lg font-semibold text-atlas-gold">
              {visibleAnimals.length} animalitos × {COLOR_TOTAL} colores
            </p>
            <p className="font-pixel text-[0.68rem] uppercase tracking-[0.14em] text-atlas-gold">
              {visibleItems.length} sprites en pantalla · {ANIMAL_TOTAL} en el
              catálogo · {ALL_FAMILIES.length} familias de sprite
            </p>
          </div>
        </header>

        {/* ── Barra de controles ─────────────────────────────────────── */}
        <section
          aria-label="Controles de la galería"
          className="sticky top-0 z-30 -mx-4 mt-4 border-b border-atlas-grid bg-atlas-frame px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* Buscador */}
              <label className="flex min-w-[15rem] flex-1 flex-col gap-1.5">
                <span className="font-pixel text-[0.6rem] font-bold uppercase tracking-[0.16em] text-atlas-gold">
                  Buscar
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="p. ej. gatito, ave, marino, INTJ…"
                  className="w-full border border-atlas-grid bg-atlas-frame px-4 py-2 text-sm text-atlas-fg placeholder:text-atlas-muted outline-none focus:border-atlas-gold focus:ring-2 focus:ring-atlas-focus/40"
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
                <span className="font-pixel text-[0.6rem] font-bold uppercase tracking-[0.16em] text-atlas-gold">
                  Animación
                </span>
                <button
                  type="button"
                  aria-pressed={animate}
                  onClick={() => setAnimate((a) => !a)}
                  className={`inline-flex items-center gap-2  border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                    animate
                      ? "border-atlas-gold bg-atlas-gold text-atlas-on-gold"
                      : "border-atlas-grid bg-atlas-frame text-atlas-muted hover:border-atlas-gold"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2  ${
                      animate ? "bg-atlas-sky" : "bg-atlas-raised"
                    }`}
                    aria-hidden="true"
                  />
                  {animate ? "respirando" : "quietos"}
                </button>
              </div>

              {/* Estados de animación */}
              <div className="flex flex-col gap-1.5">
                <span className="font-pixel text-[0.6rem] font-bold uppercase tracking-[0.16em] text-atlas-gold">
                  Estados
                </span>
                <button
                  type="button"
                  aria-pressed={showFrames}
                  onClick={() => setShowFrames((value) => !value)}
                  className={` border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                    showFrames
                      ? "border-atlas-gold bg-atlas-raised text-atlas-on-gold"
                      : "border-atlas-grid bg-atlas-frame text-atlas-muted hover:border-atlas-gold"
                  }`}
                >
                  {showFrames ? "5 frames visibles" : "ver 5 frames"}
                </button>
              </div>

              {/* Exportar */}
              <div className="flex flex-col gap-1.5">
                <span className="font-pixel text-[0.6rem] font-bold uppercase tracking-[0.16em] text-atlas-gold">
                  Exportar
                </span>
                <button
                  type="button"
                  onClick={exportSheet}
                  disabled={visibleItems.length === 0}
                  className="border border-atlas-gold bg-atlas-raised px-4 py-1.5 text-[0.72rem] font-semibold text-atlas-on-gold transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                >
                  descargar PNG
                </button>
              </div>
            </div>

            {/* Selector de color / textura */}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-pixel text-[0.6rem] font-bold uppercase tracking-[0.16em] text-atlas-gold">
                  Color / textura ({COLOR_TOTAL})
                </span>
                <div className="flex items-center gap-3">
                  {activeColor ? (
                    <span className="font-pixel text-[0.66rem] text-atlas-muted">
                      <span className="font-semibold text-atlas-fg">
                        {activeColor.nombre}
                      </span>{" "}
                      · {activeColor.hex} · {activeColor.textura} ·{" "}
                      {activeColor.temperatura}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={pickRandomColor}
                    className="border border-atlas-gold px-3 py-1 font-pixel text-[0.64rem] uppercase tracking-[0.1em] text-atlas-gold transition-colors hover:bg-atlas-gold hover:text-atlas-on-gold"
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
                      className={`inline-flex items-center gap-1.5  border py-1 pl-1 pr-2.5 text-[0.68rem] transition-colors ${
                        active
                          ? "border-atlas-gold bg-atlas-gold/10 text-atlas-fg"
                          : "border-atlas-grid bg-atlas-frame text-atlas-muted hover:border-atlas-grid"
                      }`}
                    >
                      <span
                        className="h-4 w-4 shrink-0 border border-atlas-grid"
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
            <div className="border-2 border-atlas-gold bg-atlas-gold/10 px-4 py-3 text-sm text-atlas-fg">
              <p className="font-pixel font-semibold text-atlas-gold">
                ¡Ojo! Hay detalles que revisar en el motor:
              </p>
              {audit.errors.length > 0 ? (
                <p className="mt-1 font-pixel text-[0.72rem] text-atlas-muted">
                  {audit.errors.length} sprite(s) no se pudieron generar:{" "}
                  {audit.errors.join(", ")}
                </p>
              ) : null}
              {audit.collisions.length > 0 ? (
                <p className="mt-1 font-pixel text-[0.72rem] text-atlas-muted">
                  {audit.collisions.length} colisión(es) de grid idéntico:{" "}
                  {audit.collisions.join(" · ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="border border-atlas-amistad bg-atlas-raised px-4 py-2 font-pixel text-[0.7rem] uppercase tracking-[0.12em] text-atlas-amistad">
              todo distinto ✓ · {visibleItems.length} sprites únicos, sin
              colisiones
            </p>
          )}
        </div>

        {/* ── Cuadrícula del catálogo ────────────────────────────────── */}
        <section aria-label="Animalitos del catálogo" className="mt-8">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="font-pixel text-xl font-semibold text-atlas-fg">
              Catálogo
            </h2>
            <span className="font-pixel text-[0.66rem] uppercase tracking-[0.14em] text-atlas-gold">
              {visibleAnimals.length} de {ANIMALS_LIST.length} · color {activeColor?.nombre ?? colorId}
            </span>
          </div>

          {visibleAnimals.length === 0 ? (
            <p className="border border-dashed border-atlas-grid px-4 py-8 text-center text-sm text-atlas-muted">
              Ningún animalito coincide con “{query}”. Prueba con otra palabra
              cariñosa.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
              {visibleAnimals.map((entry, index) => (
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
                  showFrames={showFrames}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-14 border-t border-atlas-grid pt-6 font-pixel text-[0.64rem] uppercase tracking-[0.14em] text-atlas-muted">
          motor determinista · {GRID_SIZE}×{GRID_SIZE}px por sprite · ruta
          exclusiva de desarrollo
        </footer>
      </div>
    </div>
  );
}
