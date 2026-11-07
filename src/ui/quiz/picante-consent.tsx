"use client";

/**
 * Picante consent gate. Before accessing Picante quizzes, the user must:
 * 1. Have an assigned identity (completed the main test)
 * 2. Confirm they are 18+
 * 3. For level 2, give a second explicit confirmation
 *
 * This component handles the consent flow and calls the API to record it.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { findQuiz } from "@/config/quiz-catalogue";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { ChoiceGroup } from "@/ui/kit/choice";

interface PicanteConsentGateProps {
  quizId: string;
  onConsentGiven: () => void;
}

type ConsentStage = "checking" | "requirements" | "age-gate" | "second-confirm" | "granting" | "error";

const AGE_OPTIONS = [
  { value: "si_soy_mayor", label: "Sí, soy mayor de 18 años" },
  { value: "no_soy_mayor", label: "No soy mayor de 18 años" },
];

const SECOND_CONFIRM_OPTIONS = [
  { value: "confirmo", label: "Sí, confirmo que quiero acceder a contenido 18+" },
  { value: "cancelo", label: "Prefiero no continuar" },
];

export function PicanteConsentGate({ quizId, onConsentGiven }: PicanteConsentGateProps) {
  const router = useRouter();
  const quiz = findQuiz(quizId);
  const isLevel2 = quiz?.nivel === 2;

  const [stage, setStage] = useState<ConsentStage>("checking");
  const [ageSelection, setAgeSelection] = useState<string[]>([]);
  const [secondConfirm, setSecondConfirm] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState({
    tieneIdentidad: false,
  });

  // Check requirements on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/quizzes/picante/access", { cache: "no-store" });
        if (!active) return;
        if (res.ok) {
          const body = await res.json();
          if (!active) return;
          if (body.ok) {
            setRequirements(body.data);
            if (!body.data.tieneIdentidad) {
              setStage("requirements");
              return;
            }
            setStage("age-gate");
            return;
          }
        }
        setStage("requirements");
      } catch {
        if (!active) return;
        setStage("error");
        setError("No pudimos verificar tus requisitos");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const grantConsent = useCallback(async () => {
    setStage("granting");
    setError(null);
    try {
      const res = await fetch("/api/quizzes/picante/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mayor_de_edad: true }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.codigo ?? "quiz.picante.error");
      }

      onConsentGiven();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar consentimiento");
      setStage("error");
    }
  }, [onConsentGiven]);

  const handleAgeSubmit = useCallback(async () => {
    if (ageSelection[0] !== "si_soy_mayor") {
      router.push("/quizzes");
      return;
    }
    if (isLevel2) {
      setStage("second-confirm");
    } else {
      await grantConsent();
    }
  }, [ageSelection, isLevel2, router, grantConsent]);

  const handleSecondConfirm = useCallback(async () => {
    if (secondConfirm[0] !== "confirmo") {
      router.push("/quizzes");
      return;
    }
    await grantConsent();
  }, [secondConfirm, router, grantConsent]);

  if (stage === "checking") {
    return (
      <div className="zm-box zm-box--frame zm-consent">
        <Icon name="loading" scale={2} />
        <p>Verificando requisitos…</p>
      </div>
    );
  }

  if (stage === "requirements") {
    return (
      <div className="zm-box zm-box--frame zm-consent">
        <Icon name="alert" scale={2} />
        <h2>Requisitos para Picante</h2>
        <p>
          Para acceder a los quizzes Picante necesitas:
        </p>
        <ul className="zm-consent__reqs">
          <li data-met={requirements.tieneIdentidad}>
            <Icon name={requirements.tieneIdentidad ? "check" : "close"} filled={requirements.tieneIdentidad} />
            {requirements.tieneIdentidad ? "Tienes identidad asignada" : "Primero completa el test principal y recibe tu animalito"}
          </li>
        </ul>
        <div className="zm-consent__actions">
          {!requirements.tieneIdentidad ? (
            <Button variant="primary" onClick={() => router.push("/cuestionario")}>
              Hacer el test
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => router.push("/quizzes")}>
            Volver a quizzes
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "age-gate") {
    return (
      <div className="zm-box zm-box--frame zm-consent">
        <Icon name="privacy" scale={2} />
        <h2>Contenido 18+</h2>
        <p>
          Los quizzes Picante tratan temas de coqueteo, romance e intimidad.
          Son opcionales, privados y no afectan tu matching psicométrico.
        </p>
        <p className="zm-consent__warning">
          <strong>Debes ser mayor de 18 años para continuar.</strong>
        </p>
        <ChoiceGroup
          labelledBy="age-question"
          options={AGE_OPTIONS}
          selected={ageSelection}
          onToggle={(v) => setAgeSelection([v])}
        />
        <div className="zm-consent__actions">
          <Button
            variant="primary"
            onClick={() => void handleAgeSubmit()}
            disabled={ageSelection.length === 0}
          >
            Continuar
          </Button>
          <Button variant="ghost" onClick={() => router.push("/quizzes")}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "second-confirm") {
    return (
      <div className="zm-box zm-box--frame zm-consent">
        <Icon name="alert" scale={2} />
        <h2>Segunda confirmación</h2>
        <p>
          Este quiz incluye preguntas más explícitas sobre preferencias de intimidad.
          ¿Confirmas que quieres acceder?
        </p>
        <ChoiceGroup
          labelledBy="second-confirm-question"
          options={SECOND_CONFIRM_OPTIONS}
          selected={secondConfirm}
          onToggle={(v) => setSecondConfirm([v])}
        />
        <div className="zm-consent__actions">
          <Button
            variant="primary"
            onClick={() => void handleSecondConfirm()}
            disabled={secondConfirm.length === 0}
          >
            Confirmar
          </Button>
          <Button variant="ghost" onClick={() => router.push("/quizzes")}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "granting") {
    return (
      <div className="zm-box zm-box--frame zm-consent">
        <Icon name="loading" scale={2} />
        <p>Guardando tu consentimiento…</p>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="zm-box zm-box--frame zm-consent">
        <Icon name="alert" scale={2} />
        <h2>Error</h2>
        <p>{error ?? "Ocurrió un error al procesar tu consentimiento"}</p>
        <div className="zm-consent__actions">
          <Button variant="primary" onClick={() => setStage("age-gate")}>
            Reintentar
          </Button>
          <Button variant="ghost" onClick={() => router.push("/quizzes")}>
            Volver a quizzes
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
