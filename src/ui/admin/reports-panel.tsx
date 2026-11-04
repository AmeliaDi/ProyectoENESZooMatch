"use client";

import { useCallback, useState } from "react";

import { ADMIN_CONFIG } from "@/config";
import { REPORT_STATUSES, type AdminReport, type ReportStatus } from "@/contracts/admin";
import { Button } from "@/ui/kit/button";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";
import { Frame } from "@/ui/kit/surfaces";
import { Tabs } from "@/ui/kit/tabs";

import { adminApi } from "./admin-api";
import { ADMIN_COPY, ADMIN_REASON_LABELS, REPORT_STATUS_LABELS, stamp } from "./admin-copy";
import { Pager } from "./pager";
import { useAdminPage } from "./use-admin-page";

const PAGE_SIZE = ADMIN_CONFIG.reports.pageSize;
const STATUS_TABS = REPORT_STATUSES.map((key) => ({ key, label: REPORT_STATUS_LABELS[key] }));

function ReportCard({ report, onReview }: { report: AdminReport; onReview(status: "revisado" | "cerrado"): void }) {
  return (
    <Frame title={`${ADMIN_REASON_LABELS[report.reason]} · ${report.track}`} coord={stamp(report.createdAt)}>
      <p className="zm-detail__muted">
        Reporta: {report.reporterAlias ?? ADMIN_COPY.noAlias} · Reportada: {report.reportedAlias ?? ADMIN_COPY.noAlias}
      </p>
      <h3 className="zm-admin__sub">{ADMIN_COPY.snapshot}</h3>
      {report.snapshot.length === 0 ? <p className="zm-detail__muted">{ADMIN_COPY.emptySnapshot}</p> : (
        <ol className="zm-admin__snapshot">
          {report.snapshot.map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              <span className="zm-detail__muted">{entry.who} · {entry.kind}</span>
              <p className="zm-admin__body">{entry.body}</p>
            </li>
          ))}
        </ol>
      )}
      {report.status === "cerrado" ? null : (
        <div className="zm-admin__actions">
          {report.status === "abierto" ? (
            <Button variant="secondary" icon="check" onClick={() => onReview("revisado")}>Marcar revisado</Button>
          ) : null}
          <Button variant="ghost" icon="close" onClick={() => onReview("cerrado")}>Cerrar reporte</Button>
        </div>
      )}
    </Frame>
  );
}

export function ReportsPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [status, setStatus] = useState<ReportStatus>("abierto");
  const [page, setPage] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => adminApi.reports(status, page), [status, page]);
  const { data, loading, failed, reload } = useAdminPage(load, onUnauthorized);

  async function review(id: string, next: "revisado" | "cerrado") {
    const result = await adminApi.reviewReport(id, next);
    if (!result.ok && result.reason === "unauthorized") return onUnauthorized();
    setNote(result.ok ? ADMIN_COPY.actionDone : (result.message ?? ADMIN_COPY.readError));
    reload();
  }

  return (
    <div className="zm-admin__panel">
      <Tabs items={STATUS_TABS} value={status} onChange={(s) => { setStatus(s); setPage(0); }} label="Estado de los reportes" idPrefix="zm-reports" />
      <p role="status" aria-live="polite" className="zm-detail__muted">{note ?? ""}</p>
      {loading && !data ? <LoadingState /> : null}
      {failed ? <ErrorState title="Sin lectura" body={ADMIN_COPY.readError} /> : null}
      {data && data.reports.length === 0 ? <EmptyState title="Sin reportes" body={ADMIN_COPY.noReports} /> : null}
      <div className="zm-admin__grid">
        {data?.reports.map((report) => (
          <ReportCard key={report.id} report={report} onReview={(next) => void review(report.id, next)} />
        ))}
      </div>
      {data ? <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} /> : null}
    </div>
  );
}
