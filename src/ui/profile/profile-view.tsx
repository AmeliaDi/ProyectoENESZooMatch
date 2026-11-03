"use client";

/**
 * "Tu carta" (Lámina 06): your own readings, any time. Owner-only data from
 * `GET /api/profile`; nothing here is shown to anyone else.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import type { ProfileDto } from "@/contracts/profile";
import { EXPERIENCE } from "@/config";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { RADIANT_AFFINITY_PERCENT } from "@/ui/constellation/render-helpers";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { PixelNumber } from "@/ui/kit/pixel-number";
import { ExitButton } from "@/ui/shared/exit-button";
import { ErrorState, LoadingState } from "@/ui/kit/states";
import { Chip, Frame } from "@/ui/kit/surfaces";

import { RefineInvite } from "@/ui/refine/refine-invite";

import { parseProfile } from "./parse-profile";
import { ProfileSections } from "./profile-sections";
import { EnneagramPlate, ReadingGuide } from "./reading-guide";

type State =
  | { kind: "loading" }
  | { kind: "error"; reason: "session" | "missing" | "generic" }
  | { kind: "ready"; profile: ProfileDto };

const PLATE = "Lámina 06 · tu carta";

function useProfile(attempt: number): State {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), EXPERIENCE.result.timeoutMs);
    let active = true;
    fetch("/api/profile", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const profile = res.ok ? parseProfile(await res.json()) : null;
        if (!active) return;
        if (res.status === 401) setState({ kind: "error", reason: "session" });
        else if (res.status === 404) setState({ kind: "error", reason: "missing" });
        else setState(profile ? { kind: "ready", profile } : { kind: "error", reason: "generic" });
      })
      .catch(() => {
        if (active) setState({ kind: "error", reason: "generic" });
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  return state;
}

const ERROR_COPY = {
  session: { title: "Tu sesión se cerró", body: "Vuelve a entrar con tu matrícula para ver tu carta." },
  missing: { title: "Tu carta aún está en blanco", body: "Cuando completes el test, aquí verás tu perfil completo." },
  generic: { title: "Se nubló la conexión", body: "No pudimos cargar tu carta. Intenta de nuevo en un momento." },
} as const;

function Actions() {
  return (
    <>
      <Link href="/resultado" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Volver a mi cielo">
        <Icon name="result" />
      </Link>
      <Link href="/ajustes" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Ajustes y privacidad">
        <Icon name="settings" />
      </Link>
      <ExitButton />
    </>
  );
}

function Hero({ profile }: { profile: ProfileDto }) {
  const { mbti, enneagram } = profile;
  return (
    <header className="zm-box zm-box--frame zm-card__hero">
      <span className="zm-card__sprite" aria-hidden="true">
        <PixelAnimal animalId={profile.animal.id} colorId={profile.color.id} mark={profile.mark} size={96} />
      </span>
      <div className="zm-card__who">
        <h1 className="zm-card__alias">{profile.alias}</h1>
        <p className="zm-card__identity">
          {profile.animal.name} {profile.color.name.toLowerCase()}
        </p>
        <div className="zm-card__chips">
          <Chip icon="personalidad">
            {mbti.code}
            {mbti.balancedAxes > 0 ? ` · ${mbti.balancedAxes} ${mbti.balancedAxes === 1 ? "eje" : "ejes"} en equilibrio` : ""}
          </Chip>
          <Chip icon="valores_relacionales">
            {enneagram.exploring ? "Eneagrama en exploración" : `Eneagrama ${enneagram.code} · ${enneagram.archetype}`}
          </Chip>
        </div>
        {profile.narrative ? <p className="zm-card__narrative">{profile.narrative}</p> : null}
      </div>
    </header>
  );
}

function Virtues({ profile }: { profile: ProfileDto }) {
  return (
    <Frame title="Tus virtudes" coord="AR 01h">
      {profile.virtues.length === 0 ? (
        <p className="zm-detail__muted">
          Tus respuestas quedaron muy equilibradas, así que no destacamos ninguna por encima de las demás. Eso también
          dice algo bonito de ti.
        </p>
      ) : (
        <ul className="zm-card__virtues">
          {profile.virtues.map((v) => (
            <li key={v.title} className="zm-box zm-box--raised zm-card__virtue">
              <Icon name="check" filled />
              <div>
                <p className="zm-card__virtue-title">{v.title}</p>
                <p className="zm-detail__muted">{v.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function Affinities({ profile }: { profile: ProfileDto }) {
  const tracks = [
    { key: "romance", label: "Romance", data: profile.affinities.romance },
    { key: "amistad", label: "Amistad", data: profile.affinities.amistad },
  ] as const;
  return (
    <Frame title="Tus afinidades" coord="AR 03h">
      <div className="zm-card__tracks">
        {tracks.map((t) => (
          <section key={t.key} className="zm-card__track" data-tone={t.key}>
            <h3 className="zm-detail__h">
              <Icon name={t.key} filled /> {t.label} · <span className="zm-num">{t.data.count}</span>
            </h3>
            {t.data.top.length === 0 ? (
              <p className="zm-detail__muted">Todavía nadie cruza el umbral aquí. Tu cielo sigue abierto.</p>
            ) : (
              <ul className="zm-card__matches">
                {t.data.top.map((m) => (
                  <li key={m.alias}>
                    <span>{m.alias}</span>
                    <span className="zm-card__pct">
                      <PixelNumber value={`${m.percent} %`} size="sm" gold={m.percent >= RADIANT_AFFINITY_PERCENT} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <Link href="/resultado" className="zm-box zm-btn zm-btn--secondary">
        Ver mi constelación
      </Link>
    </Frame>
  );
}

export function ProfileView() {
  const [attempt, setAttempt] = useState(0);
  const state = useProfile(attempt);

  if (state.kind === "loading") {
    return (
      <AtlasShell plate={PLATE} actions={<Actions />}>
        <main className="zm-center">
          <LoadingState title="Desplegando tu carta…" />
        </main>
      </AtlasShell>
    );
  }
  if (state.kind === "error") {
    const copy = ERROR_COPY[state.reason];
    const action =
      state.reason === "generic" ? (
        <Button variant="secondary" icon="recenter" onClick={() => setAttempt((n) => n + 1)}>Reintentar</Button>
      ) : (
        <Link href={state.reason === "session" ? "/" : "/cuestionario"} className="zm-box zm-btn zm-btn--primary">
          {state.reason === "session" ? "Volver a entrar" : "Hacer el test"}
        </Link>
      );
    return (
      <AtlasShell plate={PLATE} actions={<Actions />}>
        <main className="zm-center">
          <ErrorState title={copy.title} body={copy.body} action={action} />
        </main>
      </AtlasShell>
    );
  }

  const { profile } = state;
  return (
    <AtlasShell plate={PLATE} actions={<Actions />}>
      <main className="zm-card">
        <Hero profile={profile} />
        <Virtues profile={profile} />
        <Affinities profile={profile} />
        <RefineInvite
          track={profile.affinities.romance.count > 0 ? "romance" : "amistad"}
          completed={profile.completedModules}
        />
        <EnneagramPlate profile={profile} />
        <ProfileSections profile={profile} />
        <ReadingGuide />
        <p className="zm-result__fine">
          Esta carta completa solo la ves tú. Otras personas ven tu alias, tu animalito y tu color, y solo las capas
          que elijas en <Link href="/ajustes#lo-que-compartes">Lo que compartes</Link>, en bandas y nunca con números.
        </p>
      </main>
    </AtlasShell>
  );
}
