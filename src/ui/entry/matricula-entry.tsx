"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";
import { Icon } from "@/ui/kit/icon";
import { useInclusiveMode } from "@/ui/shared/inclusive-mode-selector";
import { DELETED_FLAG } from "@/ui/settings/settings-view";

import { DawnSky } from "./dawn-sky";
import { isPublicMatriculaValid, normalizePublicMatricula } from "./matricula";

export const MATRICULA_COPY = {
  promise: "Un test anónimo para descubrir con quién del campus podrías hacer constelación.",
  hint: "Nunca se guarda ni se muestra: solo un resumen cifrado que no se puede revertir.",
  invalid: "Usa solo letras y números (de 4 a 32).",
  unavailable: "El cielo no responde ahora. Intenta de nuevo en un momento.",
  misconfigured: "El observatorio aún no está listo: falta configurar el servicio.",
} as const;

export function MatriculaEntry() {
  const router = useRouter();
  const inclusiveMode = useInclusiveMode();
  const [matricula, setMatricula] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<null | "unavailable" | "misconfigured">(null);
  const submittingRef = useRef(false);
  const [deleted, setDeleted] = useState(false);

  // One-shot confirmation after "Borrar mis datos"; read after mount so the
  // server render stays identical.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        if (window.sessionStorage.getItem(DELETED_FLAG) === "1") {
          window.sessionStorage.removeItem(DELETED_FLAG);
          setDeleted(true);
        }
      } catch {
        // Storage unavailable: nothing to confirm.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalized = normalizePublicMatricula(matricula);
  const valid = isPublicMatriculaValid(matricula);
  const error = failed
    ? MATRICULA_COPY[failed]
    : touched && matricula && !valid
      ? MATRICULA_COPY.invalid
      : null;

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!valid || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFailed(null);
    try {
      const response = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula: normalized, inclusiveMode }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; redirect?: string; code?: string }
        | null;
      if (response.ok && body?.ok && typeof body.redirect === "string") {
        router.replace(body.redirect as Route);
        return;
      }
      setFailed(body?.code === "service.misconfigured" ? "misconfigured" : "unavailable");
    } catch {
      setFailed("unavailable");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AtlasShell
      plate="Lámina 01 · entrada"
      actions={
        <Link href="/ajustes" className="zm-btn zm-btn--ghost zm-btn--icon zm-box" aria-label="Ajustes">
          <Icon name="settings" />
        </Link>
      }
    >
      <main className="zm-entry">
        <DawnSky />
        <section className="zm-entry__copy">
          {deleted ? (
            <p className="zm-box zm-quiz__note" role="status">
              Listo: borramos tu perfil y tus respuestas. Gracias por haber sido parte del cielo.
            </p>
          ) : null}
          <p className="zm-eyebrow">Atlas de bolsillo · ENES</p>
          <h1 className="zm-entry__title">Tu estrella ya está en el cielo</h1>
          <p className="zm-entry__promise">{MATRICULA_COPY.promise}</p>
        </section>

        <form className="zm-box zm-box--frame zm-entry__form" onSubmit={enter} noValidate>
          <Field
            label="Matrícula"
            hint={MATRICULA_COPY.hint}
            error={error}
            name="matricula"
            value={matricula}
            onChange={(event) => {
              setMatricula(event.target.value.toUpperCase());
              if (failed) setFailed(null);
            }}
            onBlur={() => setTouched(true)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={64}
            placeholder="AB1234"
          />
          <ul className="zm-entry__facts">
            <li>
              <Icon name="privacy" filled /> Te ven solo como un alias de animalito.
            </li>
            <li>
              <Icon name="quiz" filled /> Si ya entraste, retomas donde te quedaste.
            </li>
          </ul>
          <Button type="submit" variant="primary" iconAfter="next" busy={submitting} disabled={submitting}>
            {submitting ? "Abriendo el cielo" : "Entrar"}
          </Button>
        </form>
      </main>
    </AtlasShell>
  );
}
