/**
 * Prints the Markdown tables for docs/AVATARES.md from the real config and
 * sprite engine (contrast per colour, emblem contrast, duplicates).
 */
import { AVATAR_CONFIG, CATALOG_COLORS, DESIGN_TOKENS } from "@/config";
import { EMBLEM_COLOR, getSpriteFrame } from "@/domain/avatars/pixel-sprites";

function lum(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

export async function main(): Promise<void> {
  const night = DESIGN_TOKENS.modes.night.colors.sky;
  const day = DESIGN_TOKENS.modes.day.colors.sky;
  console.log("| id | nombre | hex | vs noche | vs día | emblema vs cuerpo |\n|---|---|---|---|---|---|");
  for (const c of CATALOG_COLORS) {
    console.log(`| \`${c.id}\` | ${c.nombre} | \`${c.hex}\` | ${ratio(c.hex, night).toFixed(2)} | ${ratio(c.hex, day).toFixed(2)} | ${ratio(EMBLEM_COLOR, c.hex).toFixed(2)} |`);
  }
  const animals = Object.values(AVATAR_CONFIG.species_pools.pools).flat();
  const marks = [null, "sp", "so", "sx"] as const;
  const prints = new Set<string>();
  let total = 0;
  for (const a of animals) for (const c of CATALOG_COLORS) for (const m of marks) {
    prints.add(JSON.stringify(getSpriteFrame(a, c.id, "idle_1", m).grid));
    total++;
  }
  console.log(`\nsprites: ${total}, distintos: ${prints.size}, especies en pools: ${animals.length}`);
}
