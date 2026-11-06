"use client";

/**
 * Admin observatory: the same Atlas system, sober. Aggregates only (no ids,
 * hashes, vectors or answers), and small cells are suppressed so a tiny pool
 * cannot be re-identified from the counts (k-anonymity floor from config).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { EXPERIENCE, MATCHING_CONFIG } from "@/config";
import type { AdminMetrics } from "@/contracts/admin-metrics";
import { Button } from "@/ui/kit/button";
import { PixelNumber } from "@/ui/kit/pixel-number";
import { EmptyState } from "@/ui/kit/states";
import { Frame } from "@/ui/kit/surfaces";

import { adminApi } from "./admin-api";
import { MBTI_CODES, adminMetricsToCsv, trackCoverageRate } from "./metrics-export";
import { PixelBars } from "./pixel-bars";

const K_FLOOR = EXPERIENCE.admin.kAnonymity;

function emptyMetrics(): AdminMetrics {
  return {
    generatedAt: new Date(0).toISOString(),
    romanceThreshold: MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive,
    amistadThreshold: MATCHING_CONFIG.tracks.amistad.minimum_similarity_exclusive,
    totalProfiles: 0,
    romanceMatches: 0,
    amistadMatches: 0,
    usersWithRomanceMatch: 0,
    usersWithAmistadMatch: 0,
    huevos: 0,
    mbtiDistribution: {},
    topAnimals: [],
    topColors: [],
  };
}

function utcStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin lectura";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Counts under the k floor are shown as "< k" and plotted as zero. */
function safe(count: number): { value: number; text: string } {
  return count > 0 && count < K_FLOOR ? { value: 0, text: `< ${K_FLOOR}` } : { value: count, text: String(count) };
}

function CountTable({ caption, rows }: { caption: string; rows: ReadonlyArray<{ label: string; count: number }> }) {
  return (
    <table className="zm-contrast-table zm-admin__table">
      <caption className="zm-sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{caption}</th>
          <th scope="col">Perfiles</th>
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

/** Aggregates tab of the console; `onUnauthorized` sends back to the login. */
export function AdminDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [status, setStatus] = useState<"idle" | "refreshing" | "error">("refreshing");
  const [recomputing, setRecomputing] = useState(false);
  const inFlight = useRef(false);
  const data = metrics ?? emptyMetrics();

  const refresh = useCallback(
    async (silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!silent) setStatus("refreshing");
      const result = await adminApi.metrics();
      inFlight.current = false;
      if (!result.ok && result.reason === "unauthorized") return onUnauthorized();
      if (!result.ok) return setStatus("error");
      setMetrics(result.value);
      setStatus("idle");
    },
    [onUnauthorized],
  );

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(false), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, EXPERIENCE.admin.pollMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);

  function downloadCsv() {
    if (!metrics) return;
    const url = URL.createObjectURL(new Blob([adminMetricsToCsv(metrics)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zoomatch-agregados-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function recompute() {
    if (recomputing) return;
    setRecomputing(true);
    const result = await adminApi.recompute();
    setRecomputing(false);
    if (!result.ok && result.reason === "unauthorized") return onUnauthorized();
    if (!result.ok) return setStatus("error");
    await refresh(false);
  }

  const mbti = MBTI_CODES.map((code) => ({ label: code, count: data.mbtiDistribution[code] ?? 0 }));
  const animals = data.topAnimals.map((a) => ({ label: a.name, count: a.count }));
  const colors = data.topColors.map((c) => ({ label: c.name, count: c.count }));
  const tooFew = data.totalProfiles > 0 && data.totalProfiles < K_FLOOR;

  return (
      <div className="zm-admin__panel">
        <header className="zm-admin__head">
          <div className="zm-admin__actions">
            <Button variant="secondary" icon="recenter" busy={status === "refreshing"} onClick={() => void refresh(false)}>
              Refrescar
            </Button>
            <Button variant="secondary" icon="group" busy={recomputing} disabled={recomputing} onClick={() => void recompute()}>
              Recalcular afinidades
            </Button>
            <Button variant="primary" icon="admin" disabled={!metrics} onClick={downloadCsv}>
              Exportar CSV
            </Button>
          </div>
          <p role="status" aria-live="polite" className="zm-detail__muted">
            {status === "error" ? "Lectura interrumpida; se conserva el último agregado." : `Última lectura · ${utcStamp(data.generatedAt)}`}
          </p>
        </header>

        {data.totalProfiles === 0 && data.huevos === 0 ? (
          <EmptyState title="Cielo sin perfiles" body="Las métricas aparecen después de los primeros cuestionarios." />
        ) : null}
        {tooFew ? (
          <p className="zm-box zm-quiz__note" role="note">
            Hay menos de {K_FLOOR} perfiles: los desgloses se ocultan para proteger el anonimato.
          </p>
        ) : null}

        <div className="zm-admin__grid">
          <Frame title="Perfiles activos" coord="Σ">
            <p className="zm-admin__big">
              <PixelNumber value={data.totalProfiles.toLocaleString("es-MX")} size="lg" />
            </p>
            {/* An egg has no animal and no colour, so it is outside every breakdown below. */}
            <p className="zm-detail__muted">
              <span className="zm-num">{safe(data.huevos).text}</span> personas siguen en el cascarón, sin identidad
              fijada.
            </p>
            <p className="zm-detail__muted">Sin matrículas, hashes, vectores ni respuestas.</p>
          </Frame>
          <Frame title="Cobertura por pista" coord="%">
            <PixelBars
              tone="romance"
              data={[{ label: "Romance", value: Math.round(trackCoverageRate(data.usersWithRomanceMatch, data.totalProfiles)) }]}
            />
            <PixelBars
              tone="amistad"
              data={[{ label: "Amistad", value: Math.round(trackCoverageRate(data.usersWithAmistadMatch, data.totalProfiles)) }]}
            />
            <p className="zm-detail__muted">
              % de personas con al menos una afinidad. Umbral: romance{" "}
              <span className="zm-num">{Math.round(data.romanceThreshold * 100)} %</span>, amistad{" "}
              <span className="zm-num">{Math.round(data.amistadThreshold * 100)} %</span>.
            </p>
          </Frame>
        </div>

        {tooFew ? null : (
          <div className="zm-admin__grid">
            <Frame title="Distribución MBTI" coord="16">
              <PixelBars data={mbti.map((m) => ({ label: m.label, value: safe(m.count).value }))} />
              <CountTable caption="Tipo MBTI" rows={mbti} />
            </Frame>
            <Frame title="Animalitos más frecuentes" coord="10">
              <PixelBars tone="amistad" data={animals.map((a) => ({ label: a.label, value: safe(a.count).value }))} />
              <CountTable caption="Animalito" rows={animals} />
            </Frame>
            <Frame title="Colores más frecuentes" coord="10">
              <PixelBars tone="romance" data={colors.map((c) => ({ label: c.label, value: safe(c.count).value }))} />
              <CountTable caption="Color" rows={colors} />
            </Frame>
          </div>
        )}
      </div>
  );
}
