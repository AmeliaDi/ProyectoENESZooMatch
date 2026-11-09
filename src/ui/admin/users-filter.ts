/**
 * Facet and sort helpers for the people list.
 *
 * A facet left on "todos" does not travel: the stored function reads a missing
 * parameter as "no filter", and `exactOptionalPropertyTypes` forbids writing an
 * explicit `undefined` into `AdminUserFilter`. "orden" is a facet like any
 * other — the SQL whitelist owns what each value means, so nothing here can
 * invent a column.
 */
import type { AdminOrder, AdminUserFilter } from "@/contracts/admin";

/** The option every facet starts on: no filter, so no parameter on the wire. */
export const ALL = "todos";

/** The columns the base can sort by, grouped so one header owns both sides. */
export type SortColumn = "nombre" | "afinidades" | "fecha";

/**
 * What each header cycles through on click. The alias has one order because
 * the base exposes one; the other two flip direction, so a second click on the
 * same column is the useful second half of the sort.
 */
export const ORDER_CYCLE: Record<SortColumn, readonly AdminOrder[]> = {
  nombre: ["nombre"],
  afinidades: ["masAfinidades", "menosAfinidades"],
  fecha: ["recientes", "antiguas"],
};

/** Next order for a header: the first of its cycle, or the one after the current. */
export function nextOrder(column: SortColumn, current: AdminOrder | undefined): AdminOrder {
  const cycle = ORDER_CYCLE[column];
  const at = current === undefined ? -1 : cycle.indexOf(current);
  return cycle[(at + 1) % cycle.length]!;
}

/** Which header owns the order now, or `null` when the list is in the base's own order. */
export function sortColumnOf(orden: AdminOrder | undefined): SortColumn | null {
  if (!orden) return null;
  for (const [column, cycle] of Object.entries(ORDER_CYCLE) as [SortColumn, readonly AdminOrder[]][]) {
    if (cycle.includes(orden)) return column;
  }
  return null;
}

/**
 * Which way an order runs, so `aria-sort` tells the truth. The base puts the
 * newest sign-ups and the most affinities first, which is descending even
 * though "primero" is what a person reads; the alias runs from A to Z.
 */
const DESCENDING: readonly AdminOrder[] = ["recientes", "masAfinidades"];

export function sortDirection(orden: AdminOrder): "ascending" | "descending" {
  return DESCENDING.includes(orden) ? "descending" : "ascending";
}

/**
 * Sets one facet and leaves the others alone. `undefined` removes the key
 * instead of writing it: the wire format treats an absent parameter as "no
 * filter" and `exactOptionalPropertyTypes` forbids the explicit undefined.
 *
 * The value is whatever the select holds, so the panel never re-states the
 * contract's enums — but `userFilterParam` rejects the whole filter when one
 * value is bad, so the options must match `adminUserFilterSchema` exactly. The
 * test over `FACET_SELECTS` is what keeps that promise.
 */
export function withFacet(
  filter: AdminUserFilter,
  key: keyof AdminUserFilter,
  value: string | boolean | undefined,
): AdminUserFilter {
  const next: Record<string, unknown> = { ...filter };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as AdminUserFilter;
}

/** How many facets are narrowing the list right now; drives the reset button. */
export function activeFacetCount(filter: AdminUserFilter): number {
  return Object.keys(filter).length;
}

/** Selects speak strings; the filter speaks `boolean` for the admin-only facet. */
export function soloAdminFromSelect(value: string): boolean | undefined {
  return value === "si" ? true : undefined;
}

/** The inverse: the select value that reproduces the stored filter. */
export function selectValue(value: string | boolean | undefined): string {
  if (value === undefined) return ALL;
  return typeof value === "boolean" ? (value ? "si" : ALL) : value;
}
