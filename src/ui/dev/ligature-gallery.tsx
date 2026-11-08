"use client";

import type { CSSProperties } from "react";

const LIGATURE_PAIRS = ["fi", "fl", "ff", "ffi", "ffl"] as const;
const SAMPLE_WORDS = [
  "afinidades",
  "perfil",
  "confianza",
  "diferente",
  "fluido",
  "ofrecer",
  "affles",
] as const;
const SIZES_PX = [14, 16, 20, 24, 32] as const;

function Cell({ text, family, px }: { text: string; family: "pixel" | "read"; px: number }) {
  const style: CSSProperties = {
    fontFamily: family === "pixel" ? "var(--font-pixel)" : "var(--font-read)",
    fontSize: `${px}px`,
  };
  return (
    <span className="zm-numeros__sample" style={style}>
      {text}
    </span>
  );
}

export function LigatureGallery() {
  return (
    <div className="zm-root relative min-h-dvh">
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10">
        <header className="grid gap-3">
          <p className="font-pixel text-sm text-atlas-muted">dev · tipografía</p>
          <h1 className="zm-pixel-title font-pixel text-3xl">Ligaduras deshabilitadas</h1>
          <p className="zm-veil max-w-prose text-atlas-muted">
            Verificación visual: &ldquo;fi&rdquo; debe verse como f + i, no como un glifo único.
            CSS global: <code>font-variant-ligatures: none</code> y{" "}
            <code>font-feature-settings: &quot;liga&quot; 0, &quot;clig&quot; 0, &quot;calt&quot; 0</code>.
            Si algún par se ve fusionado, la fuente o el navegador ignoró la regla.
          </p>
        </header>

        {(["night", "day"] as const).map((theme) => (
          <section key={theme} data-theme={theme} className="zm-root zm-numeros__panel">
            <h2 className="zm-pixel-title font-pixel text-xl">
              {theme === "night" ? "Noche (oscuro)" : "Día (claro)"}
            </h2>
            {SIZES_PX.map((px) => (
              <div key={px} className="zm-numeros__size">
                <h3 className="zm-numeros__h">{px} px</h3>
                <div className="zm-numeros__row">
                  <span className="zm-numeros__label">Pixelify · pares</span>
                  <div className="zm-numeros__cells">
                    {LIGATURE_PAIRS.map((pair) => (
                      <Cell key={pair} text={pair} family="pixel" px={px} />
                    ))}
                  </div>
                </div>
                <div className="zm-numeros__row">
                  <span className="zm-numeros__label">Pixelify · palabras</span>
                  <div className="zm-numeros__cells">
                    {SAMPLE_WORDS.map((word) => (
                      <Cell key={word} text={word} family="pixel" px={px} />
                    ))}
                  </div>
                </div>
                <div className="zm-numeros__row">
                  <span className="zm-numeros__label">Atkinson · pares</span>
                  <div className="zm-numeros__cells">
                    {LIGATURE_PAIRS.map((pair) => (
                      <Cell key={pair} text={pair} family="read" px={px} />
                    ))}
                  </div>
                </div>
                <div className="zm-numeros__row">
                  <span className="zm-numeros__label">Atkinson · palabras</span>
                  <div className="zm-numeros__cells">
                    {SAMPLE_WORDS.map((word) => (
                      <Cell key={word} text={word} family="read" px={px} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}