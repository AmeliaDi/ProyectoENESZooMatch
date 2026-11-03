/**
 * Dev-only comparison of number treatments (ADR-028), at 12/14/16/24/32 px
 * on the night and day palettes:
 *   A · Pixelify Sans + `tabular-nums` (no `tnum` table: no effect),
 *   B · Atkinson Hyperlegible Next + `tabular-nums` (all digits advance 632),
 *   C · own 5×7 atlas on the `--zm-px` grid (integer scales, real text kept).
 * B with a second pixel font via `unicode-range` was not built: it would add a
 * font download for no gain over C (see the ADR).
 */

import type { CSSProperties, ReactNode } from "react";

import { PIXEL_CHARSET, canDrawPixelText } from "@/domain/shared";
import { PixelNumber, type PixelNumberSize } from "@/ui/kit/pixel-number";

const SIZES_PX = [12, 14, 16, 24, 32] as const;
/** Atlas scale whose glyph height (7 · 2 px · scale) is closest to each font size's cap height. */
const ATLAS_SIZE_FOR: Readonly<Record<(typeof SIZES_PX)[number], PixelNumberSize | null>> = {
  12: null,
  14: "sm",
  16: "sm",
  24: "md",
  32: "lg",
};
const SAMPLES = ["87 %", "1,234", "3/5", "12:45", "+12 \u2212 3 \u00D7 2", "100 %", "11 %"] as const;
const DIGITS = "0123456789";
const SYMBOLS = "% . , : / + \u2212 \u00D7 x";
const THEMES = [
  { key: "night", label: "Noche (oscuro)" },
  { key: "day", label: "Día (claro)" },
] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="zm-numeros__row">
      <span className="zm-numeros__label">{label}</span>
      <div className="zm-numeros__cells">{children}</div>
    </div>
  );
}

function Sample({ text, family, px }: { text: string; family: "pixel" | "read"; px: number }) {
  const style: CSSProperties = {
    fontFamily: family === "pixel" ? "var(--font-pixel)" : "var(--font-read)",
    fontSize: `${px}px`,
    fontVariantNumeric: "tabular-nums",
  };
  return (
    <span className="zm-numeros__sample" style={style}>
      {text}
    </span>
  );
}

function AtlasSample({ text, size }: { text: string; size: PixelNumberSize | null }) {
  if (!size) return <span className="zm-numeros__sample zm-numeros__na">—</span>;
  if (!canDrawPixelText(text)) return <span className="zm-numeros__sample zm-numeros__na">sin glifo</span>;
  return (
    <span className="zm-numeros__sample">
      <PixelNumber value={text} size={size} />
    </span>
  );
}

function ThemePanel({ theme, label }: { theme: string; label: string }) {
  return (
    <section data-theme={theme} className="zm-root zm-numeros__panel">
      <h2 className="zm-pixel-title font-pixel text-xl">{label}</h2>
      {SIZES_PX.map((px) => (
        <div key={px} className="zm-numeros__size">
          <h3 className="zm-numeros__h">{px} px</h3>
          <Row label="A · Pixelify + tabular">
            <Sample text={DIGITS} family="pixel" px={px} />
            <Sample text={SYMBOLS} family="pixel" px={px} />
            {SAMPLES.map((s) => (
              <Sample key={s} text={s} family="pixel" px={px} />
            ))}
          </Row>
          <Row label="B · Atkinson + tabular">
            <Sample text={DIGITS} family="read" px={px} />
            <Sample text={SYMBOLS} family="read" px={px} />
            {SAMPLES.map((s) => (
              <Sample key={s} text={s} family="read" px={px} />
            ))}
          </Row>
          <Row label="C · atlas 5×7">
            <AtlasSample text={DIGITS} size={ATLAS_SIZE_FOR[px]} />
            <AtlasSample text={SYMBOLS.replaceAll(" ", "")} size={ATLAS_SIZE_FOR[px]} />
            {SAMPLES.map((s) => (
              <AtlasSample key={s} text={s} size={ATLAS_SIZE_FOR[px]} />
            ))}
          </Row>
        </div>
      ))}
    </section>
  );
}

export function NumbersGallery() {
  return (
    <div className="zm-root relative min-h-dvh">
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10">
        <header className="grid gap-3">
          <p className="font-pixel text-sm text-atlas-muted">dev · números legibles</p>
          <h1 className="zm-pixel-title font-pixel text-3xl">A, B y C a 12, 14, 16, 24 y 32 px</h1>
          <p className="zm-veil max-w-prose text-atlas-muted">
            A no cambia nada con tabular-nums porque Pixelify no trae la tabla tnum: el «1» sigue más angosto y el 0 es
            igual a la O. B alinea las cifras (todas avanzan lo mismo). C es el atlas propio: siempre a escala entera de
            la retícula; a 12 px no hay escala entera legible, por eso ahí se usa B. Glifos del atlas:{" "}
            <span className="zm-num">{PIXEL_CHARSET.filter((c) => c.trim() !== "").join(" ")}</span>.
          </p>
          <p className="zm-veil max-w-prose">
            Decisión (ADR-028): C para cifras destacadas (afinidad en carta, detalle, lista de matches y total del panel);
            B para cifras chicas (progreso, puntos, tablas, ejes y la etiqueta del lienzo).
          </p>
        </header>
        <div className="zm-numeros">
          {THEMES.map((theme) => (
            <ThemePanel key={theme.key} theme={theme.key} label={theme.label} />
          ))}
        </div>
      </main>
    </div>
  );
}
