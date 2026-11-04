"use client";

import { useCallback, useState } from "react";

import { ADMIN_CONFIG } from "@/config";
import type { AdminUser } from "@/contracts/admin";
import { Chip } from "@/ui/kit/surfaces";
import { ErrorState, EmptyState, LoadingState } from "@/ui/kit/states";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";

import { adminApi } from "./admin-api";
import { ADMIN_COPY, stamp } from "./admin-copy";
import { Pager } from "./pager";
import { useAdminPage } from "./use-admin-page";
import { UserDetail } from "./user-detail";

const PAGE_SIZE = ADMIN_CONFIG.users.pageSize;

function UserRow({ user, onOpen }: { user: AdminUser; onOpen(): void }) {
  return (
    <tr>
      <th scope="row">
        {user.alias ?? ADMIN_COPY.noAlias}
        {user.isAdmin ? <Chip tone="neutral">{ADMIN_COPY.adminBadge}</Chip> : null}
      </th>
      <td>{user.animal ? `${user.animal} · ${user.color ?? ""}` : "—"}</td>
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
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const load = useCallback(() => adminApi.users(search, page), [search, page]);
  const { data, loading, failed, reload } = useAdminPage(load, onUnauthorized);

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
      {loading && !data ? <LoadingState /> : null}
      {failed ? <ErrorState title="Sin lectura" body={ADMIN_COPY.readError} /> : null}
      {data && data.users.length === 0 ? <EmptyState title="Sin resultados" body={ADMIN_COPY.noUsers} /> : null}
      {data && data.users.length > 0 ? (
        <div className="zm-admin__scroll">
          <table className="zm-contrast-table zm-admin__table zm-admin__users">
            <caption className="zm-sr-only">Cuentas registradas</caption>
            <thead>
              <tr>
                <th scope="col">Alias</th><th scope="col">Animalito</th><th scope="col">Cuestionario</th>
                <th scope="col">Estado</th><th scope="col">Afinidades R / A</th><th scope="col">Reportes</th>
                <th scope="col">Alta</th><th scope="col"><span className="zm-sr-only">Acciones</span></th>
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
