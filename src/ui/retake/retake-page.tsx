"use client";

/**
 * `/afinar/retomar`: le pregunta a la app qué toca repetir. Si hay plan, abre el
 * quiz; si no, dice por qué con la misma calma, y en ningún caso deja entender
 * que esa persona se queda fuera de sus coincidencias.
 */
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";

import type { RetakeViewDto } from "@/contracts/retake";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Frame } from "@/ui/kit/surfaces";
import { ErrorState } from "@/ui/kit/states";
import { LoadingFrame } from "@/ui/shared/chrome";

import { isPlan, parseRetakeView, statusFor } from "./retake-flow";
import { RetakeQuiz } from "./retake-quiz";

const PLATE = "Lámina 07 · retomar";

type State =
  | { step: "loading" }
  | { step: "signed" }
  | { step: "broken" }
  | { step: "ready"; view: RetakeViewDto };

export function RetakePage() {
  const [state, setState] = useState<State>({ step: "loading" });

  const load = useCallback(async () => {
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/quiz/retake");
      if (res.status === 401) return setState({ step: "signed" });
      const view = res.ok ? parseRetakeView(await res.json().catch(() => null)) : null;
      return setState(view ? { step: "ready", view } : { step: "broken" });
    } catch {
      setState({ step: "broken" });
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  if (state.step === "loading") {
    return <LoadingFrame label="Viendo qué te toca repetir…" plate={PLATE} />;
  }

  if (state.step === "signed") {
    return (
      <AtlasShell plate={PLATE}>
        <main className="zm-center">
          <ErrorState
            title="Tu sesión se cerró"
            body="Vuelve a entrar con tu matrícula para ver qué preguntas te toca repetir."
          />
        </main>
      </AtlasShell>
    );
  }

  if (state.step === "broken") {
    return (
      <AtlasShell plate={PLATE}>
        <main className="zm-center">
          <ErrorState
            title="No pudimos consultar tus preguntas"
            body="Tus respuestas ya guardadas siguen igual. Inténtalo de nuevo en un momento."
            action={
              <Button variant="primary" onClick={() => void load()}>
                Intentar de nuevo
              </Button>
            }
          />
        </main>
      </AtlasShell>
    );
  }

  if (isPlan(state.view)) return <RetakeQuiz view={state.view} />;

  const copy = statusFor(state.view);
  return (
    <AtlasShell plate={PLATE}>
      <main className="zm-center">
        <Frame title={copy.title}>
          <p className="zm-detail__muted">{copy.body}</p>
          <div className="zm-math__actions">
            <Link href={copy.href as Route} className="zm-box zm-btn zm-btn--primary">
              {copy.cta}
            </Link>
            {copy.href === "/perfil" ? null : (
              <Link href="/perfil" className="zm-box zm-btn zm-btn--ghost">
                Volver a mi carta
              </Link>
            )}
          </div>
        </Frame>
      </main>
    </AtlasShell>
  );
}
