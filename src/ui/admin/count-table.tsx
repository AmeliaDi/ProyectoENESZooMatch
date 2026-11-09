/**
 * The words beside a pixel chart. Every chart here is `aria-hidden`: this
 * table is what a screen reader reads and what a person copying a number
 * uses, so the same counts appear twice by design.
 */
import { safe } from "./k-anon";

export function CountTable({
  caption,
  rows,
  unit = "Perfiles",
}: {
  caption: string;
  rows: ReadonlyArray<{ label: string; count: number }>;
  /** What a row counts; the observatory mixes people, pairs and admin actions. */
  unit?: string;
}) {
  return (
    <table className="zm-contrast-table zm-admin__table">
      <caption className="zm-sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{caption}</th>
          <th scope="col">{unit}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={2}>Sin datos agregados</td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{safe(row.count).text}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
