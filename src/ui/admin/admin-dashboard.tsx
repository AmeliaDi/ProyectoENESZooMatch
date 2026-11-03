"use client";

/**
 * Admin observatory: the same Atlas system, sober. Aggregates only (no ids,
 * hashes, vectors or answers), and small cells are suppressed so a tiny pool
 * cannot be re-identified from the counts (k-anonymity floor from config).
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { EXPERIENCE, MATCHING_CONFIG } from "@/config";
import { parseAdminMetrics, type AdminMetrics } from "@/contracts/admin-metrics";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { PixelNumber } from "@/ui/kit/pixel-number";
import { EmptyState } from "@/ui/kit/states";
import { Frame } from "@/ui/kit/surfaces";

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

export function AdminDashboard({ initialData }: { initialData: AdminMetrics | null }) {
  const router = useRouter();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(initialData);
  const [status, setStatus] = useState<"idle" | "refreshing" | "error">(initialData ? "idle" : "error");
  const [recomputing, setRecomputing] = useState(false);
  const inFlight = useRef(false);
  const data = metrics ?? emptyMetrics();

  const refresh = useCallback(
    async (silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!silent) setStatus("refreshing");
      try {
        const response = await fetch("/api/admin/metrics", { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (response.status === 401 || response.status === 403) {
          router.replace("/admin/login");
          return;
        }
        const parsed = response.ok ? parseAdminMetrics(await response.json()) : null;
        if (!parsed) throw new Error("metrics_unavailable");
        setMetrics(parsed);
        setStatus("idle");
      } catch {
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [router],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, EXPERIENCE.admin.pollMs);
    return () => window.clearInterval(timer);
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
    try {
      const response = await fetch("/api/admin/recompute", { method: "POST", signal: AbortSignal.timeout(120000) });
      if (response.status === 401 || response.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("recompute_unavailable");
      await refresh(false);
    } catch {
      setStatus("error");
    } finally {
      setRecomputing(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  const mbti = MBTI_CODES.map((code) => ({ label: code, count: data.mbtiDistribution[code] ?? 0 }));
  const animals = data.topAnimals.map((a) => ({ label: a.animal, count: a.count }));
  const colors = data.topColors.map((c) => ({ label: c.color, count: c.count }));
  const tooFew = data.totalProfiles > 0 && data.totalProfiles < K_FLOOR;

  return (
    <AtlasShell
      plate="Observatorio · solo agregados"
      actions={
        <Button variant="ghost" icon="logout" onClick={() => void logout()}>
          Salir
        </Button>
      }
    >
      <main className="zm-admin">
        <header className="zm-admin__head">
          <h1 className="zm-settings__title">Observatorio</h1>
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

        {data.totalProfiles === 0 ? (
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
      </main>
    </AtlasShell>
  );
}
