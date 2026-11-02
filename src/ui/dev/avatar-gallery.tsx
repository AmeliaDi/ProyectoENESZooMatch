"use client";

/**
 * /dev/avatars — the full identity grid: 16 MBTI codes (rows; archetypal
 * species of each pool) × 9 Enneagram types (columns), with wing, subtype mark
 * and background selectors, a duplicate alarm and a PNG spritesheet export.
 * Real size: 48 px (3 × the 16-px grid, an integer scale).
 */

import { useMemo, useState } from "react";

import { AVATAR_CONFIG, CATALOG_COLORS, DESIGN_TOKENS, MBTI_CODES } from "@/config";
import { GRID_SIZE, getSpriteFrame } from "@/domain/avatars/pixel-sprites";
import type { SpriteMark } from "@/ui/constellation/types";

type Wing = "none" | "deep" | "light";
type Sky = "night" | "day";
const SCALE = 3;
const TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const MARKS: readonly (SpriteMark | null)[] = [null, "sp", "so", "sx"];
const COLOR_IDS = new Set(CATALOG_COLORS.map((c) => c.id));

function colorFor(type: number, wing: Wing): string {
  if (wing === "none") return `ennea-${type}`;
  const neighbour = wing === "deep" ? (type === 1 ? 9 : type - 1) : type === 9 ? 1 : type + 1;
  return `ennea-${type}-w${neighbour}`;
}

function Sprite({ animalId, colorId, mark }: { animalId: string; colorId: string; mark: SpriteMark | null }) {
  const grid = getSpriteFrame(animalId, colorId, "idle_1", mark).grid;
  return (
    <svg width={GRID_SIZE * SCALE} height={GRID_SIZE * SCALE} viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`} shapeRendering="crispEdges" aria-hidden="true">
      {grid.flatMap((row, y) => row.map((fill, x) => (fill ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} /> : null)))}
    </svg>
  );
}

function exportSheet(rows: readonly { animalId: string; colors: readonly string[] }[], mark: SpriteMark | null): void {
  const canvas = document.createElement("canvas");
  canvas.width = TYPES.length * GRID_SIZE;
  canvas.height = rows.length * GRID_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  rows.forEach((row, r) =>
    row.colors.forEach((colorId, c) =>
      getSpriteFrame(row.animalId, colorId, "idle_1", mark).grid.forEach((line, y) =>
        line.forEach((fill, x) => {
          if (!fill) return;
          ctx.fillStyle = fill;
          ctx.fillRect(c * GRID_SIZE + x, r * GRID_SIZE + y, 1, 1);
        }),
      ),
    ),
  );
  const link = document.createElement("a");
  link.download = `zoomatch-avatares-${mark ?? "sin-marca"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function AvatarGallery() {
  const [wing, setWing] = useState<Wing>("none");
  const [mark, setMark] = useState<SpriteMark | null>(null);
  const [sky, setSky] = useState<Sky>("night");

  const rows = useMemo(
    () =>
      MBTI_CODES.map((code) => ({
        code,
        animalId: AVATAR_CONFIG.species_pools.pools[code]?.[0] ?? "",
        colors: TYPES.map((t) => colorFor(t, wing)),
      })),
    [wing],
  );

  const duplicates = useMemo(() => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const row of rows) {
      for (const colorId of row.colors) {
        const print = JSON.stringify(getSpriteFrame(row.animalId, colorId, "idle_1", mark).grid);
        const key = `${row.code}/${colorId}`;
        const prior = seen.get(print);
        if (prior) clashes.push(`${prior} = ${key}`);
        else seen.set(print, key);
      }
    }
    return clashes;
  }, [rows, mark]);

  const background = DESIGN_TOKENS.modes[sky].colors.sky;
  const ink = DESIGN_TOKENS.modes[sky].colors.fg;
  const missing = rows.flatMap((r) => r.colors).filter((id) => !COLOR_IDS.has(id));

  return (
    <main style={{ background, color: ink, padding: 16, minHeight: "100vh" }}>
      <h1>Galería de avatares</h1>
      <p>Filas: MBTI (especie más arquetípica de cada grupo). Columnas: eneatipo 1–9. Tamaño real: 48 px.</p>
      <fieldset style={{ display: "flex", gap: 16, flexWrap: "wrap", border: 0, padding: 0 }}>
        <label>
          Ala{" "}
          <select value={wing} onChange={(e) => setWing(e.target.value as Wing)}>
            <option value="none">sin ala (tono base)</option>
            <option value="deep">ala anterior (tono profundo)</option>
            <option value="light">ala siguiente (tono claro)</option>
          </select>
        </label>
        <label>
          Subtipo{" "}
          <select value={mark ?? ""} onChange={(e) => setMark((e.target.value || null) as SpriteMark | null)}>
            {MARKS.map((m) => (
              <option key={m ?? "none"} value={m ?? ""}>
                {m ? AVATAR_CONFIG.subtypes[m].nombre : "sin marca"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fondo{" "}
          <select value={sky} onChange={(e) => setSky(e.target.value as Sky)}>
            <option value="night">cielo nocturno</option>
            <option value="day">carta diurna</option>
          </select>
        </label>
        <button type="button" onClick={() => exportSheet(rows, mark)}>
          Exportar spritesheet PNG
        </button>
      </fieldset>
      <p role="status">
        {duplicates.length === 0 && missing.length === 0
          ? `Sin duplicados: ${rows.length * TYPES.length} sprites distintos.`
          : `Atención: ${duplicates.length} duplicados, ${missing.length} colores fuera del catálogo. ${duplicates.slice(0, 5).join("; ")}`}
      </p>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th />
            {TYPES.map((t) => (
              <th key={t} scope="col" title={AVATAR_CONFIG.emblems[String(t) as "1"].razon}>
                {t} · {AVATAR_CONFIG.emblems[String(t) as "1"].nombre}
              </th>
            ))}
            <th scope="col">neutro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <th scope="row" style={{ textAlign: "left", paddingRight: 8 }}>
                {row.code}
                <br />
                <small>{row.animalId}</small>
              </th>
              {row.colors.map((colorId) => (
                <td key={colorId} title={colorId} style={{ padding: 2 }}>
                  <Sprite animalId={row.animalId} colorId={colorId} mark={mark} />
                </td>
              ))}
              <td title="ennea-neblina" style={{ padding: 2 }}>
                <Sprite animalId={row.animalId} colorId="ennea-neblina" mark={mark} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
