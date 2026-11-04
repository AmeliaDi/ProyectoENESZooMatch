"use client";

import { useCallback, useState } from "react";

import { ADMIN_CONFIG } from "@/config";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";

import { adminApi } from "./admin-api";
import { ADMIN_COPY, AUDIT_LABELS, stamp } from "./admin-copy";
import { Pager } from "./pager";
import { useAdminPage } from "./use-admin-page";

const PAGE_SIZE = ADMIN_CONFIG.audit.pageSize;

function detailText(detail: Record<string, string | number | boolean | null>): string {
  return Object.entries(detail).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

export function AuditPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [page, setPage] = useState(0);
  const load = useCallback(() => adminApi.audit(page), [page]);
  const { data, loading, failed } = useAdminPage(load, onUnauthorized);

  return (
    <div className="zm-admin__panel">
      {loading && !data ? <LoadingState /> : null}
      {failed ? <ErrorState title="Sin lectura" body={ADMIN_COPY.readError} /> : null}
      {data && data.entries.length === 0 ? <EmptyState title="Sin registros" body={ADMIN_COPY.noAudit} /> : null}
      {data && data.entries.length > 0 ? (
        <div className="zm-admin__scroll">
          <table className="zm-contrast-table zm-admin__table zm-admin__users">
            <caption className="zm-sr-only">Auditoría de acciones administrativas</caption>
            <thead>
              <tr><th scope="col">Fecha</th><th scope="col">Admin</th><th scope="col">Acción</th><th scope="col">Cuenta</th><th scope="col">Detalle</th></tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="zm-num">{stamp(entry.createdAt)}</td>
                  <td>{entry.adminAlias ?? "—"}</td>
                  <th scope="row">{AUDIT_LABELS[entry.action]}</th>
                  <td>{entry.targetAlias ?? "—"}</td>
                  <td>{detailText(entry.detail) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data ? <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}
