"use client";

import { useCallback, useState } from "react";

import { ADMIN_CONFIG } from "@/config";
import { ADMIN_ORDERS, type AdminOrder, type AdminUser, type AdminUserFilter } from "@/contracts/admin";
import { formatIdentity } from "@/domain/identity/format-identity";
import { Chip } from "@/ui/kit/surfaces";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";

import { adminApi } from "./admin-api";
import { ADMIN_COPY, FACET_SELECTS, ORDEN_LABELS, facetsActive, stamp, type FacetSelect } from "./admin-copy";
import { MBTI_CODES } from "./metrics-export";
import { Pager } from "./pager";
import { UserDetail } from "./user-detail";
import {
  ALL,
  activeFacetCount,
  nextOrder,
  selectValue,
  soloAdminFromSelect,
  sortColumnOf,
  sortDirection,
  withFacet,
  type SortColumn,
} from "./users-filter";
import { useAdminPage } from "./use-admin-page";

const PAGE_SIZE = ADMIN_CONFIG.users.pageSize;

/** The mark a header wears: none while the list follows the base's own order. */
const SORT_IDLE = "△";
const SORT_MARKS = { ascending: "▲", descending: "▼" } as const;

/** The MBTI and order selects read the contract's own lists, never a copy. */
const MBTI_FACET: FacetSelect = {
  key: "mbti",
  label: "Tipo MBTI",
  options: [{ value: ALL, label: "Cualquiera" }, ...MBTI_CODES.map((code) => ({ value: code, label: code }))],
};

const ORDEN_FACET: FacetSelect = {
  key: "orden",
  label: "Orden",
  options: [{ value: ALL, label: "El de la base" }, ...ADMIN_ORDERS.map((order) => ({ value: order, label: ORDEN_LABELS[order] }))],
};

/** One facet: `todos` is the absence of a filter, so it never reaches the wire. */
function Facet({ facet, value, onChange }: { facet: FacetSelect; value: string; onChange(value: string): void }) {
  return (
    <label className="zm-admin__facet">
      <span className="zm-field__label">{facet.label}</span>
      <select
        className="zm-box zm-admin__select"
        name={`admin-facet-${facet.key}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {facet.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SortHeader({
  column,
  orden,
  label,
  onSort,
}: {
  column: SortColumn;
  orden: AdminOrder | undefined;
  label: string;
  onSort(column: SortColumn): void;
}) {
  const direction = orden !== undefined && sortColumnOf(orden) === column ? sortDirection(orden) : null;
  const next = nextOrder(column, orden);
  return (
    <th scope="col" aria-sort={direction ?? "none"}>
      <button type="button" className="zm-admin__sort" aria-label={`${label}: ${ORDEN_LABELS[next]}`} onClick={() => onSort(column)}>
        <span>{label}</span>
        <span className="zm-admin__sortmark" aria-hidden="true">
          {direction ? SORT_MARKS[direction] : SORT_IDLE}
        </span>
      </button>
    </th>
  );
}

function UserRow({ user, onOpen }: { user: AdminUser; onOpen(): void }) {
  const name = formatIdentity(user.identity);
  return (
    <tr>
      <th scope="row">
        {name.title}
        {name.isEgg ? <Chip tone="neutral">{ADMIN_COPY.eggBadge}</Chip> : null}
        {user.isAdmin ? <Chip tone="neutral">{ADMIN_COPY.adminBadge}</Chip> : null}
      </th>
      <td>{name.isEgg ? ADMIN_COPY.insideEgg : name.shortName}</td>
      <td>{user.quizCompletedAt ? "Sí" : "No"}</td>
      <td>{user.paused ? "Pausado" : "Activo"}</td>
      <td className="zm-num">{user.romanceMatches} / {user.amistadMatches}</td>
      <td className="zm-num">{user.reportsReceived}</td>
      <td className="zm-num">{stamp(user.createdAt)}</td>
      <td>
        <Button variant="ghost" icon="list" onClick={onOpen}>
          {ADMIN_COPY.details}
        </Button>
      </td>
    </tr>
  );
}

export function UsersPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminUserFilter>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const load = useCallback(() => adminApi.users(search, page, filter), [search, page, filter]);
  const { data, loading, failed, reload } = useAdminPage(load, onUnauthorized);

  const facets = [...FACET_SELECTS, MBTI_FACET, ORDEN_FACET];
  const activeCount = activeFacetCount(filter);

  /** A facet change narrows the list, so the page restarts: page 3 of a filter nobody asked for. */
  function applyFacet(key: keyof AdminUserFilter, value: string | boolean | undefined) {
    setPage(0);
    setFilter((current) => withFacet(current, key, value));
  }

  function onFacetChange(facet: FacetSelect, raw: string) {
    if (raw === ALL) return applyFacet(facet.key, undefined);
    if (facet.key === "soloAdmin") return applyFacet(facet.key, soloAdminFromSelect(raw));
    applyFacet(facet.key, raw);
  }

  function sortBy(column: SortColumn) {
    applyFacet("orden", nextOrder(column, filter.orden));
  }

  function closeDetail(changed: boolean) {
    setSelected(null);
    if (changed) reload();
  }

  return (
    <div className="zm-admin__panel">
      <form
        className="zm-admin__search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setSearch(query.trim());
        }}
      >
        <Field label={ADMIN_COPY.searchLabel} hint={ADMIN_COPY.searchHint} name="admin-search" value={query}
          maxLength={ADMIN_CONFIG.users.searchMaxChars} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" variant="secondary" icon="list">Buscar</Button>
      </form>

      <div className="zm-admin__facets">
        <div className="zm-admin__facetgrid" role="group" aria-label={ADMIN_COPY.facetsLegend}>
          {facets.map((facet) => (
            <Facet
              key={facet.key}
              facet={facet}
              value={selectValue(filter[facet.key])}
              onChange={(raw) => onFacetChange(facet, raw)}
            />
          ))}
          <Field label="Altas desde" name="admin-desde" type="date" value={filter.desde ?? ""}
            onChange={(e) => applyFacet("desde", e.target.value === "" ? undefined : e.target.value)} />
          <Field label="Altas hasta" name="admin-hasta" type="date" value={filter.hasta ?? ""}
            onChange={(e) => applyFacet("hasta", e.target.value === "" ? undefined : e.target.value)} />
        </div>
        <div className="zm-admin__facetfoot">
          <p role="status" aria-live="polite" className="zm-detail__muted">
            {activeCount === 0 ? "Sin filtros: todas las cuentas." : facetsActive(activeCount)}
          </p>
          {activeCount === 0 ? null : (
            <Button variant="ghost" icon="recenter" onClick={() => { setPage(0); setFilter({}); }}>
              {ADMIN_COPY.facetsReset}
            </Button>
          )}
        </div>
      </div>

      {loading && !data ? <LoadingState /> : null}
      {failed ? <ErrorState title="Sin lectura" body={ADMIN_COPY.readError} /> : null}
      {data && data.users.length === 0 ? <EmptyState title="Sin resultados" body={ADMIN_COPY.noUsers} /> : null}
      {data && data.users.length > 0 ? (
        <div className="zm-admin__scroll">
          <table className="zm-contrast-table zm-admin__table zm-admin__users">
            <caption className="zm-sr-only">Cuentas registradas</caption>
            <thead>
              <tr>
                <SortHeader column="nombre" orden={filter.orden} label="Alias" onSort={sortBy} />
                <th scope="col">Identidad</th><th scope="col">Cuestionario</th>
                <th scope="col">Estado</th>
                <SortHeader column="afinidades" orden={filter.orden} label="Afinidades R / A" onSort={sortBy} />
                <th scope="col">Reportes</th>
                <SortHeader column="fecha" orden={filter.orden} label="Alta" onSort={sortBy} />
                <th scope="col"><span className="zm-sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => <UserRow key={user.id} user={user} onOpen={() => setSelected(user)} />)}
            </tbody>
          </table>
        </div>
      ) : null}
      {data ? <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} /> : null}
      <UserDetail user={selected} onClose={closeDetail} onUnauthorized={onUnauthorized} />
    </div>
  );
}
