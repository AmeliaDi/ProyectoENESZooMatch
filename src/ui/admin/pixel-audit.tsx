/**
 * Administrative activity inside the observatory window: what the console did,
 * not what the people did. These are counts of admin actions, so the
 * k-anonymity floor is not what governs them — the Auditoría tab already lists
 * every one of them with its alias, and a summary cannot hide more than that.
 */
import type { AdminAuditAction } from "@/contracts/admin";
import type { AuditSummary } from "@/contracts/admin-metrics";

import { ADMIN_COPY, AUDIT_LABELS } from "./admin-copy";
import { CountTable } from "./count-table";
import { PixelBars, type BarDatum } from "./pixel-bars";
import { ranked } from "./pixel-composition";

/** The stored list of actions is the base's, not ours: an unknown key shows as written. */
export function actionWord(action: string): string {
  return action in AUDIT_LABELS ? AUDIT_LABELS[action as AdminAuditAction] : action;
}

export function auditActionRows(porAccion: Record<string, number>): BarDatum[] {
  return ranked(porAccion, actionWord);
}

/** `2026-11-08` prints as `11-08`: the window is short enough that the year is noise. */
export function auditDayRows(porDia: readonly { day: string; n: number }[]): BarDatum[] {
  return porDia.map((row) => ({ label: row.day.slice(5), value: row.n }));
}

export function PixelAudit({ summary }: { summary: AuditSummary }) {
  const actions = auditActionRows(summary.porAccion);
  const days = auditDayRows(summary.porDia);

  if (summary.total === 0) {
    return <p className="zm-detail__muted">{ADMIN_COPY.noAudit}</p>;
  }

  return (
    <div className="zm-audit">
      <p className="zm-detail__muted">
        <span className="zm-num">{summary.total}</span> acciones en la ventana. Se cuentan por tipo, nunca por
        persona.
      </p>
      <PixelBars data={actions} />
      <CountTable caption="Acción" rows={actions.map((row) => ({ label: row.label, count: row.value }))} unit="Acciones" />
      <p className="zm-admin__sub">Por día</p>
      <PixelBars tone="amistad" data={days} />
    </div>
  );
}
