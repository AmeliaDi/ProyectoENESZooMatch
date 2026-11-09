/**
 * Composition of the sky: what the hatched people are made of. An egg has
 * none of these columns, and the three sections do not share a denominator
 * (Enneagram and mark need `estado_identidad = 'eclosionado'`, modules need a
 * finished quiz), so each section shows the sum of its own cells instead of a
 * total that would quietly differ from it.
 */
import type { Composition } from "@/contracts/admin-metrics";

import { CountTable } from "./count-table";
import { PixelBars, type BarDatum, type BarTone } from "./pixel-bars";
import { safe } from "./k-anon";

/** The instinct short words, as the profile reads them. */
export const MARK_WORDS: Record<string, string> = {
  sp: "autoconservación",
  so: "social",
  sx: "uno a uno",
};

/** A stored mark, or the code itself when the catalogue grows before this map does. */
export function markWord(mark: string): string {
  return MARK_WORDS[mark] ?? mark;
}

export function moduleLabel(modules: number): string {
  return `${modules} ${modules === 1 ? "módulo" : "módulos"}`;
}

/**
 * Cells ordered by how many people they hold, name breaking ties. The payload
 * comes from `jsonb_object_agg`, which promises no order at all, so without
 * this the chart would shuffle rows between reads.
 */
export function ranked(cells: Record<string, number>, word: (key: string) => string = (key) => key): BarDatum[] {
  return Object.entries(cells)
    .map(([label, value]) => ({ label: word(label), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function rowsTotal(rows: readonly BarDatum[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0);
}

function Section({ title, tone, rows }: { title: string; tone: BarTone; rows: readonly BarDatum[] }) {
  return (
    <section className="zm-composition__section">
      <h3 className="zm-detail__h">
        {title} (<span className="zm-num">{rowsTotal(rows)}</span>)
      </h3>
      {rows.length === 0 ? (
        <p className="zm-detail__muted">Sin datos agregados.</p>
      ) : (
        <>
          <PixelBars tone={tone} data={rows.map((row) => ({ label: row.label, value: safe(row.value).value }))} />
          <CountTable caption={title} rows={rows.map((row) => ({ label: row.label, count: row.value }))} />
        </>
      )}
    </section>
  );
}

export function PixelComposition({ composition }: { composition: Composition }) {
  const modules = composition.modulos
    .slice()
    .sort((a, b) => a.n - b.n)
    .map((row) => ({ label: moduleLabel(row.n), value: row.total }));
  if (Object.keys(composition.eneagrama).length === 0 && Object.keys(composition.marcas).length === 0 && modules.length === 0) {
    return <p className="zm-detail__muted">Sin eclosionados con estos datos todavía.</p>;
  }

  return (
    <div className="zm-composition">
      <p className="zm-detail__muted">
        Cada bloque suma solo las cuentas que rellenan ese campo: un número pequeño puede ser una persona, así que las
        celdas bajo el umbral de anonimato se muestran como «&lt; k».
      </p>
      <Section title="Enneagrama" tone="neutral" rows={ranked(composition.eneagrama)} />
      <Section title="Marca de instinto" tone="amistad" rows={ranked(composition.marcas, markWord)} />
      <Section title="Módulos respondidos" tone="romance" rows={modules} />
    </div>
  );
}
