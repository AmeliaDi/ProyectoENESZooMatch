"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  MBTI_CODES,
  adminMetricsToCsv,
  parseAdminMetrics,
  type AdminMetrics,
} from "@/lib/admin-dashboard";

interface AdminDashboardProps {
  initialData: AdminMetrics | null;
  threshold: number;
}

const chartColors = ["#c7e879", "#8fae66", "#ef936d", "#6aa6a0"];

function emptyMetrics(threshold: number): AdminMetrics {
  return {
    generatedAt: new Date(0).toISOString(),
    threshold,
    totalProfiles: 0,
    matchedUsers: 0,
    matchedPercentage: 0,
    mbtiDistribution: MBTI_CODES.map((code) => ({ code, count: 0 })),
    topAnimals: [],
  };
}

function utcStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin lectura";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function AdminDashboard({ initialData, threshold }: AdminDashboardProps) {
  const router = useRouter();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(initialData);
  const [status, setStatus] = useState<"idle" | "refreshing" | "error">(
    initialData ? "idle" : "error",
  );
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const data = metrics ?? emptyMetrics(threshold);
  const isZero = data.totalProfiles === 0;

  const refresh = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setStatus("refreshing");

    try {
      const response = await fetch("/api/admin/metrics", {
        cache: "no-store",
        credentials: "same-origin",
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("metrics_unavailable");

      const parsed = parseAdminMetrics(await response.json());
      if (!parsed) throw new Error("invalid_metrics");
      if (mounted.current) {
        setMetrics(parsed);
        setStatus("idle");
      }
    } catch {
      if (mounted.current) setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 60_000);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  function downloadCsv() {
    if (!metrics) return;
    const blob = new Blob([adminMetricsToCsv(metrics)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `zoomatch-agregados-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="admin-shell min-h-screen overflow-hidden px-4 py-4 text-[#eef2e3] sm:px-6 lg:px-8">
      <div className="admin-grid" aria-hidden="true" />
      <div className="admin-orbit admin-orbit-a" aria-hidden="true" />

      <div className="admin-reveal relative z-10 mx-auto max-w-[96rem]">
        <header className="flex flex-col gap-5 border border-white/10 bg-[#0b100e]/90 px-5 py-5 backdrop-blur-xl md:flex-row md:items-end md:justify-between lg:px-7">
          <div className="flex items-start gap-4">
            <span className="admin-pulse mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#c7e879]" aria-hidden="true" />
            <div>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.25em] text-[#8fae66]">ZooMatch / Control de hábitat</p>
              <h1 className="mt-2 font-display text-[clamp(2.3rem,5vw,4.8rem)] leading-[0.85] tracking-[-0.055em]">
                Observatorio <span className="italic text-[#c7e879]">vivo.</span>
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh(false)}
              disabled={status === "refreshing"}
              className="min-h-11 border border-white/15 px-4 font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white transition hover:border-[#c7e879] hover:text-[#c7e879] focus-visible:ring-2 focus-visible:ring-[#c7e879] disabled:cursor-wait disabled:opacity-45"
            >
              {status === "refreshing" ? "Actualizando" : "Refrescar"}
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={!metrics}
              className="min-h-11 bg-[#c7e879] px-4 font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#0b100e] transition hover:bg-white focus-visible:ring-2 focus-visible:ring-white disabled:opacity-35"
            >
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="min-h-11 px-3 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[#718079] transition hover:text-white focus-visible:ring-2 focus-visible:ring-white"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-x border-b border-white/10 bg-[#0b100e]/70 px-5 py-3 font-mono text-[0.59rem] uppercase tracking-[0.16em] text-[#718079]">
          <p role="status" aria-live="polite" className={status === "error" ? "text-[#ef936d]" : ""}>
            {status === "error" ? "Lectura interrumpida; conserva el último agregado" : `Última lectura · ${utcStamp(data.generatedAt)}`}
          </p>
          <p>Polling visible · 60 s / umbral &gt; {(data.threshold * 100).toFixed(0)}%</p>
        </div>

        <section aria-label="Resumen de métricas" className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1.45fr]">
          <article className="admin-panel relative overflow-hidden p-5 lg:p-7">
            <p className="admin-label">Perfiles totales</p>
            <p className="mt-5 font-display text-7xl leading-none tracking-[-0.06em] text-white">{data.totalProfiles.toLocaleString("es-MX")}</p>
            <p className="mt-5 max-w-xs text-sm leading-6 text-[#718079]">Registros anónimos; el panel no consulta matrículas, hashes ni respuestas.</p>
            <span className="absolute -bottom-8 right-2 font-display text-[9rem] text-white/[0.025]" aria-hidden="true">Σ</span>
          </article>

          <article className="admin-panel p-5 lg:p-7">
            <p className="admin-label">Usuarios con al menos un match</p>
            <div className="mt-4 flex items-end gap-4">
              <p className="font-display text-7xl leading-none tracking-[-0.06em] text-[#c7e879]">{data.matchedPercentage.toFixed(1)}%</p>
              <p className="pb-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-[#718079]">{data.matchedUsers} distintos</p>
            </div>
            <div className="mt-6 h-1.5 overflow-hidden bg-white/5" aria-hidden="true">
              <span className="block h-full bg-[#c7e879] transition-[width] duration-700" style={{ width: `${data.matchedPercentage}%` }} />
            </div>
            <p className="mt-4 text-xs leading-5 text-[#718079]">Similitud estrictamente mayor al umbral activo.</p>
          </article>

          <article className="admin-panel p-5 md:col-span-2 lg:p-7 xl:col-span-1">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="admin-label">Distribución MBTI completa</p>
                <h2 className="mt-2 font-display text-3xl tracking-[-0.04em]">Dieciséis señales</h2>
              </div>
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[#718079]">n = {data.mbtiDistribution.reduce((sum, item) => sum + item.count, 0)}</span>
            </div>
            <div className="mt-5 h-56" aria-label="Gráfica de distribución de los 16 tipos MBTI">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.mbtiDistribution} margin={{ top: 8, right: 0, bottom: 0, left: -28 }} accessibilityLayer>
                  <CartesianGrid stroke="#ffffff0d" vertical={false} />
                  <XAxis dataKey="code" tick={{ fill: "#718079", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-55} textAnchor="end" height={48} />
                  <YAxis allowDecimals={false} tick={{ fill: "#718079", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ background: "#111915", border: "1px solid #ffffff1a", color: "#eef2e3", fontSize: 12 }} />
                  <Bar dataKey="count" name="Perfiles" radius={[2, 2, 0, 0]}>
                    {data.mbtiDistribution.map((entry, index) => <Cell key={entry.code} fill={chartColors[Math.floor(index / 4)]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        {isZero && (
          <section className="mt-4 border border-dashed border-[#c7e879]/30 bg-[#c7e879]/[0.035] px-6 py-5 text-center" role="status">
            <p className="font-display text-2xl italic text-[#c7e879]">Hábitat sin perfiles todavía.</p>
            <p className="mt-1 text-sm text-[#718079]">La vista mantiene los 16 tipos en cero y espera la primera medición.</p>
          </section>
        )}

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="admin-panel overflow-hidden p-5 lg:p-7">
            <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="admin-label">Taxonomía agregada</p>
                <h2 className="mt-2 font-display text-4xl tracking-[-0.045em]">Top 5 animalitos</h2>
              </div>
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-[#ef936d]">frecuencia</span>
            </div>

            {data.topAnimals.length > 0 ? (
              <div className="mt-5 h-64" aria-label="Gráfica de los cinco animalitos más frecuentes">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topAnimals} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }} accessibilityLayer>
                    <CartesianGrid stroke="#ffffff0d" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "#718079", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="animal" width={115} tick={{ fill: "#eef2e3", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ background: "#111915", border: "1px solid #ffffff1a", color: "#eef2e3", fontSize: 12 }} />
                    <Bar dataKey="count" name="Perfiles" fill="#ef936d" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="grid h-64 place-items-center text-center">
                <div>
                  <p className="font-display text-3xl italic text-white/75">Sin especies asignadas</p>
                  <p className="mt-2 text-sm text-[#718079]">El ranking aparecerá después de los primeros cuestionarios.</p>
                </div>
              </div>
            )}
          </article>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="admin-panel overflow-auto p-5 lg:p-6">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="mb-4 text-left font-display text-2xl tracking-[-0.03em]">Conteo MBTI accesible</caption>
                <thead className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[#718079]">
                  <tr><th scope="col" className="border-b border-white/10 pb-3">Tipo</th><th scope="col" className="border-b border-white/10 pb-3 text-right">Perfiles</th></tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {data.mbtiDistribution.map(({ code, count }) => (
                    <tr key={code}><th scope="row" className="border-b border-white/5 py-2 font-medium text-[#c7e879]">{code}</th><td className="border-b border-white/5 py-2 text-right text-[#9ca9a1]">{count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-panel overflow-auto p-5 lg:p-6">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="mb-4 text-left font-display text-2xl tracking-[-0.03em]">Ranking accesible</caption>
                <thead className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-[#718079]">
                  <tr><th scope="col" className="border-b border-white/10 pb-3">Animalito</th><th scope="col" className="border-b border-white/10 pb-3 text-right">Perfiles</th></tr>
                </thead>
                <tbody>
                  {data.topAnimals.length > 0 ? data.topAnimals.map(({ animal, count }) => (
                    <tr key={animal}><th scope="row" className="border-b border-white/5 py-3 font-medium text-white">{animal}</th><td className="border-b border-white/5 py-3 text-right font-mono text-xs text-[#ef936d]">{count}</td></tr>
                  )) : (
                    <tr><td colSpan={2} className="py-6 text-center text-[#718079]">Sin datos agregados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer className="mt-4 flex flex-col gap-2 border-t border-white/10 py-4 font-mono text-[0.56rem] uppercase tracking-[0.15em] text-[#56635d] sm:flex-row sm:justify-between">
          <p>Solo agregados · sin identificadores · sin vectores · sin respuestas</p>
          <p>Autorización doble: servidor + RPC</p>
        </footer>
      </div>
    </main>
  );
}
