"use client";

/**
 * Admin observatory: the same Atlas system, sober. Aggregates only (no ids,
 * hashes, vectors or answers), and small cells are suppressed so a tiny pool
 * cannot be re-identified from the counts (k-anonymity floor from config).
 *
 * The window selector is the only knob that changes what the base computes:
 * the value travels to `/api/admin/metrics`, which accepts only the windows
 * listed in `ADMIN_CONFIG.metrics` and falls back to the default otherwise, so
 * a hand-typed `?days=` can never widen the scan.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { ADMIN_CONFIG, EXPERIENCE, MATCHING_CONFIG } from "@/config";
import { emptyAdminMetrics, hasObservatory, type AdminMetrics, type HatchDelay } from "@/contracts/admin-metrics";
import { Button } from "@/ui/kit/button";
import { PixelNumber } from "@/ui/kit/pixel-number";
import { EmptyState } from "@/ui/kit/states";
import { Frame } from "@/ui/kit/surfaces";

import { adminApi } from "./admin-api";
import { CountTable } from "./count-table";
import { CounterPanel } from "./counter-panel";
import { K_FLOOR, publishable, safe, tooFewToBreakDown } from "./k-anon";
import { MBTI_CODES, adminMetricsToCsv, trackCoverageRate } from "./metrics-export";
import { PixelAudit } from "./pixel-audit";
import { PixelBars } from "./pixel-bars";
import { PixelComposition } from "./pixel-composition";
import { PixelFunnel } from "./pixel-funnel";
import { PixelHistogram } from "./pixel-histogram";
import { PixelSeries } from "./pixel-series";

const WINDOWS = ADMIN_CONFIG.metrics.windowsDays;

function emptyMetrics(): AdminMetrics {
  return emptyAdminMetrics(
    MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive,
    MATCHING_CONFIG.tracks.amistad.minimum_similarity_exclusive,
  );
}

function utcStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin lectura";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Hours with one decimal: the RPC answers in hours, so no unit is invented here. */
function hours(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} h`;
}

/**
 * Time from alta to eclosión. Under the floor the quantile is not published at
 * all: over three people a median is those three people's data, not a
 * population's, so the sample size is guarded here and not only in the cells.
 */
export function delayText(delay: HatchDelay): string {
  if (delay.muestra === 0) return "Sin eclosiones medidas todavía.";
  if (!publishable(delay.muestra)) {
    return `Muestra de ${delay.muestra}: bajo ${K_FLOOR} eclosionos no se publica la mediana.`;
  }
  return `Mediana ${hours(delay.medianaHoras)} · p75 ${hours(delay.p75Horas)} · muestra ${delay.muestra}.`;
}

/** Aggregates tab of the console; `onUnauthorized` sends back to the login. */
export function AdminDashboard({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [status, setStatus] = useState<"idle" | "refreshing" | "error">("refreshing");
  const [recomputing, setRecomputing] = useState(false);
  const [days, setDays] = useState<number>(ADMIN_CONFIG.metrics.defaultWindowDays);
  const inFlight = useRef(false);
  const data = metrics ?? emptyMetrics();
  const observatory = hasObservatory(data);
  const tooFew = tooFewToBreakDown(data.totalProfiles);

  const refresh = useCallback(
    async (windowDays: number, silent = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (!silent) setStatus("refreshing");
      const result = await adminApi.metrics(windowDays);
      inFlight.current = false;
      if (!result.ok && result.reason === "unauthorized") return onUnauthorized();
      if (!result.ok) return setStatus("error");
      setMetrics(result.value);
      setStatus("idle");
    },
    [onUnauthorized],
  );

  // A new window re-runs this effect, which is how it gets read exactly like
  // the first one was: one shot, then the visibility-aware poll.
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(days, false), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(days, true);
    }, EXPERIENCE.admin.pollMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [days, refresh]);

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
    await refresh(days, false);
  }

  const mbti = MBTI_CODES.map((code) => ({ label: code, count: data.mbtiDistribution[code] ?? 0 }));
  const animals = data.topAnimals.map((a) => ({ label: a.name, count: a.count }));
  const colors = data.topColors.map((c) => ({ label: c.name, count: c.count }));
  const hatch = publishable(data.eclosion.muestra);

  return (
      <div className="zm-admin__panel">
        <header className="zm-admin__head">
          <div className="zm-admin__actions">
            <Button variant="secondary" icon="recenter" busy={status === "refreshing"} onClick={() => void refresh(days, false)}>
              Refrescar
            </Button>
            <Button variant="secondary" icon="group" busy={recomputing} disabled={recomputing} onClick={() => void recompute()}>
              Recalcular afinidades
            </Button>
            <Button variant="primary" icon="admin" disabled={!metrics} onClick={downloadCsv}>
              Exportar CSV
            </Button>
          </div>
          <div className="zm-admin__windows" role="group" aria-label="Ventana de días del observatorio">
            {WINDOWS.map((option) => (
              <Button
                key={option}
                variant={option === days ? "primary" : "ghost"}
                busy={option === days && status === "refreshing"}
                onClick={() => setDays(option)}
              >
                {option} días
              </Button>
            ))}
          </div>
          <p role="status" aria-live="polite" className="zm-detail__muted">
            {status === "error"
              ? "Lectura interrumpida; se conserva el último agregado."
              : `Última lectura · ${utcStamp(data.generatedAt)} · ventana pedida: ${days} días`}
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

        {observatory ? (
          <>
            {/* The two rows the base seeds, so an absent list means "not served", not "nobody". */}
            <CounterPanel
              counters={data.contadores}
              eclosionados={data.embudo.eclosionados}
              onChanged={() => void refresh(days, true)}
              onUnauthorized={onUnauthorized}
            />

            <Frame title="Evolución diaria" coord={`${data.ventanaDias}d`}>
              <PixelSeries points={data.series} desde={data.desde} hasta={data.hasta} />
            </Frame>

            <div className="zm-admin__grid">
              <Frame title="Embudo de participación" coord="%">
                <PixelFunnel funnel={data.embudo} />
              </Frame>
              <Frame title="Tiempo hasta eclosionar" coord="h">
                <p className="zm-detail__muted">Horas entre el alta y la identidad fijada, sobre las cuentas vivas.</p>
                <p className="zm-detail__muted">{delayText(data.eclosion)}</p>
                <CountTable
                  caption="Eclosión"
                  rows={[
                    { label: "Mediana (h)", count: hatch ? Math.round(data.eclosion.medianaHoras ?? 0) : 0 },
                    { label: "p75 (h)", count: hatch ? Math.round(data.eclosion.p75Horas ?? 0) : 0 },
                    { label: "Muestra", count: data.eclosion.muestra },
                  ]}
                />
              </Frame>
            </div>

            <div className="zm-admin__grid">
              <Frame title="Calidad del romance" coord="z">
                <p className="zm-detail__muted">
                  <span className="zm-num">{data.matching.romance.conAfinidad}</span> personas con al menos una
                  afinidad de romance; <span className="zm-num">{data.matching.romance.aislados}</span> presentes sin
                  ninguna.
                </p>
                <PixelHistogram
                  track={data.matching.romance}
                  threshold={data.romanceThreshold}
                  reference={data.referencias.romance}
                  tone="romance"
                />
              </Frame>
              <Frame title="Calidad de la amistad" coord="z">
                <p className="zm-detail__muted">
                  <span className="zm-num">{data.matching.amistad.conAfinidad}</span> personas con al menos una
                  afinidad de amistad; <span className="zm-num">{data.matching.amistad.aislados}</span> presentes sin
                  ninguna.
                </p>
                <PixelHistogram
                  track={data.matching.amistad}
                  threshold={data.amistadThreshold}
                  reference={data.referencias.amistad}
                  tone="amistad"
                />
              </Frame>
            </div>

            <div className="zm-admin__grid">
              <Frame title="Composición del cielo" coord="n">
                <PixelComposition composition={data.composicion} />
              </Frame>
              <Frame title="Actividad de administración" coord="a">
                <PixelAudit summary={data.auditoria} />
              </Frame>
            </div>
          </>
        ) : (
          <p className="zm-box zm-quiz__note" role="note">
            Esta lectura no trae el observatorio ampliado: la base respondió solo los dos umbrales, así que no hay
            serie, embudo ni calidad por pista.
          </p>
        )}

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
