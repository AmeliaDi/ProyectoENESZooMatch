"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EXPERIENCE } from "@/config";
import type { MatchTrack } from "@/types/microtest";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";
import { Tabs } from "@/ui/kit/tabs";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { adaptResult } from "@/ui/constellation/adapt-result";
import { type ApiError, RECOMPUTE_PENDING_KEY } from "@/ui/shared/chrome";

import { MatchCard } from "./match-card";
import { parsePublicResult, type PublicResult } from "./parse-result";

// The sky (physics + sprites) is the heaviest part of the page: load it only
// when it is shown, after the result itself has painted.
const ConstellationSection = dynamic(
  () => import("@/ui/constellation/ConstellationSection").then((m) => m.ConstellationSection),
  { ssr: false, loading: () => <LoadingState title="Acomodando las estrellas…" /> },
);

export const FEW_PEOPLE_COPY =
  "Todavía somos pocxs en el cielo. Cuando entre más gente, tu constelación puede crecer.";

type View = "cielo" | "lista";

function useResult(attempt: number) {
  const [state, setState] = useState<{ result: PublicResult | null; error: ApiError; loading: boolean }>({
    result: null,
    error: null,
    loading: true,
  });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), EXPERIENCE.result.timeoutMs);
    const floor = new Promise((resolve) => window.setTimeout(resolve, EXPERIENCE.result.minimumLoadingMs));
    let active = true;
    (async () => {
      try {
        const [response] = await Promise.all([
          fetch("/api/result", { signal: controller.signal, cache: "no-store" }),
          floor,
        ]);
        if (!active) return;
        if (!response.ok) {
          setState({ result: null, error: response.status === 401 ? "session" : "generic", loading: false });
          return;
        }
        const parsed = parsePublicResult(await response.json());
        setState({ result: parsed, error: parsed ? null : "generic", loading: false });
      } catch {
        if (active) setState({ result: null, error: "generic", loading: false });
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  return state;
}

export function PublicResultView() {
  const [attempt, setAttempt] = useState(0);
  const { result, error, loading } = useResult(attempt);
  const [track, setTrack] = useState<MatchTrack>("romance");
  const [view, setView] = useState<View>("cielo");
  const [skyKey, setSkyKey] = useState(0);
  const [pending] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(RECOMPUTE_PENDING_KEY) === "1",
  );

  const actions = (
    <>
      <Link href="/perfil" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Tu carta" title="Tu carta">
        <Icon name="personalidad" />
      </Link>
      <Link href="/ajustes" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Ajustes y privacidad">
        <Icon name="settings" />
      </Link>
    </>
  );

  if (loading) {
    return (
      <AtlasShell plate="Lámina 04 · tu cielo" actions={actions}>
        <main className="zm-center">
          <LoadingState title="Encendiendo estrellas…" body="Calculando con quién hace constelación tu animalito." />
        </main>
      </AtlasShell>
    );
  }

  if (error || !result) {
    return (
      <AtlasShell plate="Lámina 04 · tu cielo" actions={actions}>
        <main className="zm-center">
          <ErrorState
            title={error === "session" ? "Tu sesión se cerró" : "Se nubló la conexión"}
            body={
              error === "session"
                ? "Vuelve a entrar con tu matrícula para ver tu cielo."
                : "No pudimos cargar tu constelación. Intenta de nuevo en un momento."
            }
            action={
              error === "session" ? (
                <Link href="/" className="zm-box zm-btn zm-btn--primary">
                  Volver a entrar
                </Link>
              ) : (
                <Button variant="secondary" icon="recenter" onClick={() => setAttempt((n) => n + 1)}>
                  Reintentar
                </Button>
              )
            }
          />
        </main>
      </AtlasShell>
    );
  }

  const matches = result.matches[track];
  const total = result.matches.romance.length + result.matches.amistad.length;
  const self = adaptResult(result)?.me ?? null;
  const emptyMessage = result.fewPeople ? FEW_PEOPLE_COPY : result.no_match_message;

  return (
    <AtlasShell plate="Lámina 04 · tu cielo" actions={actions} bare={view === "cielo"}>
      <main className="zm-result" data-view={view}>
        <header className="zm-result__me">
          {self ? (
            <span className="zm-result__sprite" aria-hidden="true">
              <PixelAnimal animalId={self.animalId} colorId={self.colorId} mark={self.mark} size={48} />
            </span>
          ) : null}
          <div>
            <h1 className="zm-result__alias">{result.alias}</h1>
            <p className="zm-result__identity">
              {result.animal.diminutivo_es} {result.color.nombre.toLowerCase()}
              {result.mbti_code ? ` · ${result.mbti_code}` : ""}
            </p>
          </div>
        </header>

        <div className="zm-result__controls">
          <Tabs<MatchTrack>
            label="Tipo de conexión"
            idPrefix="constellation"
            items={[
              { key: "romance", label: `Romance · ${result.matches.romance.length}`, icon: "romance", tone: "romance" },
              { key: "amistad", label: `Amistad · ${result.matches.amistad.length}`, icon: "amistad", tone: "amistad" },
            ]}
            value={track}
            onChange={setTrack}
          />
          <div className="zm-result__tools">
            <Button
              variant="secondary"
              icon={view === "cielo" ? "list" : "result"}
              aria-pressed={view === "lista"}
              onClick={() => setView(view === "cielo" ? "lista" : "cielo")}
            >
              {view === "cielo" ? "Ver lista" : "Ver cielo"}
            </Button>
            {view === "cielo" ? (
              <Button variant="ghost" icon="recenter" onClick={() => setSkyKey((k) => k + 1)}>
                Recentrar
              </Button>
            ) : null}
          </div>
        </div>

        {pending && total === 0 ? (
          <p className="zm-box zm-quiz__note" role="status">
            Tu resultado ya está guardado. Estamos terminando de calcular el cielo; vuelve en un ratito.
          </p>
        ) : null}

        {view === "cielo" ? (
          <ConstellationSection key={skyKey} result={result} track={track} emptyMessage={emptyMessage} />
        ) : matches.length === 0 ? (
          <EmptyState
            title={result.fewPeople ? "Somos pocxs todavía" : "Tu cielo está tranquilo"}
            body={emptyMessage}
            art={self ? <PixelAnimal animalId={self.animalId} colorId={self.colorId} mark={self.mark} size={72} /> : undefined}
          />
        ) : (
          <section
            id={`constellation-panel-${track}`}
            role="tabpanel"
            aria-labelledby={`constellation-tab-${track}`}
            className="zm-result__list"
          >
            {matches.map((match, i) => (
              <MatchCard key={match.id ?? `${track}-${i}`} match={match} track={track} />
            ))}
          </section>
        )}

        <p className="zm-result__fine">
          Afinidad estimada con el test, no destino. <Link href="/ajustes#como-se-calcula">Cómo se calcula</Link>
        </p>
      </main>
    </AtlasShell>
  );
}
