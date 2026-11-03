"use client";

/**
 * "Lo que compartes" (ADR-030). One switch per reading layer; all off by
 * default. Others only ever see bands (leaning + how sure), never numbers,
 * and never orientation, identity, politics, religion or hard filters.
 * Each change saves on its own and can be undone at any time.
 */
import { useEffect, useState } from "react";

import { SELF_READING } from "@/config/self-reading";
import { isShareLayer, type ShareLayerId } from "@/types/sharing";

type State = { kind: "loading" } | { kind: "guest" } | { kind: "ready"; layers: ShareLayerId[] };

function useSharedLayers() {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    fetch("/api/privacy", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { sharedLayers?: unknown } | null;
        if (!active) return;
        const layers = Array.isArray(body?.sharedLayers) ? body.sharedLayers.filter(isShareLayer) : null;
        setState(res.ok && layers ? { kind: "ready", layers } : { kind: "guest" });
      })
      .catch(() => active && setState({ kind: "guest" }));
    return () => {
      active = false;
    };
  }, []);
  return [state, setState] as const;
}

async function save(layers: readonly ShareLayerId[]): Promise<boolean> {
  const res = await fetch("/api/privacy", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sharedLayers: layers }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export function SharingSection() {
  const [state, setState] = useSharedLayers();
  const [busy, setBusy] = useState<ShareLayerId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (state.kind === "loading") return <p className="zm-detail__muted">Revisando lo que compartes…</p>;
  if (state.kind === "guest") return <p className="zm-detail__muted">Entra con tu matrícula para elegir qué compartes.</p>;

  async function toggle(id: ShareLayerId) {
    if (state.kind !== "ready") return;
    const on = state.layers.includes(id);
    const next = on ? state.layers.filter((l) => l !== id) : [...state.layers, id];
    setBusy(id);
    setMessage(null);
    const ok = await save(next);
    setBusy(null);
    if (ok) setState({ kind: "ready", layers: next });
    setMessage(ok ? (on ? "Listo, esa capa vuelve a ser solo tuya." : "Listo, ahora esa capa se ve en bandas.") : "No pudimos guardar el cambio. Intenta de nuevo en un momento.");
  }

  return (
    <div className="zm-sharing">
      <p className="zm-detail__muted">
        Por defecto, las personas de tu cielo ven solo tu alias, tu animalito y tu color. Si quieres, puedes mostrar
        alguna capa más. Se ve en bandas (hacia dónde te inclinas), nunca en números, y nunca incluye tu orientación,
        identidad, postura política, espiritualidad ni tus filtros.
      </p>
      <ul className="zm-sharing__list">
        {SELF_READING.sharing.layers.map((layer) => {
          const on = state.layers.includes(layer.id);
          return (
            <li key={layer.id}>
              <button
                type="button"
                className="zm-box zm-btn zm-btn--secondary zm-sharing__toggle"
                aria-pressed={on}
                disabled={busy !== null}
                onClick={() => void toggle(layer.id)}
              >
                <span className="zm-sharing__box" aria-hidden="true" data-on={on} />
                {layer.label}
                <span className="zm-sr-only">{on ? " (se comparte)" : " (solo tú)"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className="zm-settings__message">
        {message}
      </p>
    </div>
  );
}
