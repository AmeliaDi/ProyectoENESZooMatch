"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";
import { Icon } from "@/ui/kit/icon";
import { useInclusiveMode } from "@/ui/shared/inclusive-mode-selector";
import { DELETED_FLAG } from "@/ui/settings/settings-view";

import { DawnSky } from "./dawn-sky";
import {
  ACCESS_KEY_LIMITS,
  MATRICULA_DIGITS,
  isAccessKeyValid,
  isPublicMatriculaValid,
  normalizePublicMatricula,
  sanitizeMatriculaInput,
} from "./matricula";
import { type EntryFailure, useEntry } from "./use-entry";

export const MATRICULA_COPY = {
  promise: "Un test anónimo para descubrir con quién del campus podrías hacer constelación.",
  hint: "Nunca se guarda ni se muestra: solo un resumen cifrado que no se puede revertir.",
  invalid: `Escribe tu matrícula completa: ${MATRICULA_DIGITS} números, sin letras ni guiones.`,
  keyHint: `La primera vez, la clave que escribas queda como tuya (de ${ACCESS_KEY_LIMITS.minLength} a ${ACCESS_KEY_LIMITS.maxLength} caracteres). Después la necesitarás para volver.`,
  keyInvalid: `Tu clave necesita de ${ACCESS_KEY_LIMITS.minLength} a ${ACCESS_KEY_LIMITS.maxLength} caracteres.`,
  wrongKey: "La matrícula o la clave no coinciden. Revisa e intenta de nuevo.",
  locked: "Hubo varios intentos seguidos. Por cuidado, espera unos minutos antes de volver a intentar.",
  unavailable: "El cielo no responde ahora. Intenta de nuevo en un momento.",
  misconfigured: "El observatorio aún no está listo: falta configurar el servicio.",
  sharedDevice: "¿Dispositivo compartido? Usa «Salir» al terminar.",
} as const;

function useDeletedNotice(): boolean {
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
  return deleted;
}

function fieldErrors(failed: EntryFailure | null, touched: boolean, matricula: string, accessKey: string) {
  if (failed) return { matricula: null, key: MATRICULA_COPY[failed] };
  return {
    matricula: touched && !isPublicMatriculaValid(matricula) ? MATRICULA_COPY.invalid : null,
    key: touched && !isAccessKeyValid(accessKey) ? MATRICULA_COPY.keyInvalid : null,
  };
}

export function MatriculaEntry() {
  const inclusiveMode = useInclusiveMode();
  const deleted = useDeletedNotice();
  const { enter, submitting, failed, clearFailure } = useEntry(inclusiveMode);
  const [matricula, setMatricula] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [touched, setTouched] = useState(false);
  const errors = fieldErrors(failed, touched, matricula, accessKey);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!isPublicMatriculaValid(matricula) || !isAccessKeyValid(accessKey)) return;
    void enter(normalizePublicMatricula(matricula), accessKey);
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

        <form className="zm-box zm-box--frame zm-entry__form" onSubmit={submit} noValidate>
          <Field
            label="Matrícula"
            hint={MATRICULA_COPY.hint}
            error={errors.matricula}
            name="matricula"
            value={matricula}
            onChange={(event) => {
              setMatricula(sanitizeMatriculaInput(event.target.value));
              if (failed) clearFailure();
            }}
            autoComplete="username"
            spellCheck={false}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={MATRICULA_DIGITS}
            placeholder={"0".repeat(MATRICULA_DIGITS)}
            required
          />
          <Field
            label="Clave personal"
            hint={MATRICULA_COPY.keyHint}
            error={errors.key}
            name="accessKey"
            type="password"
            value={accessKey}
            onChange={(event) => {
              setAccessKey(event.target.value);
              if (failed) clearFailure();
            }}
            autoComplete="current-password"
            spellCheck={false}
            maxLength={ACCESS_KEY_LIMITS.maxLength}
            required
          />
          <ul className="zm-entry__facts">
            <li>
              <Icon name="privacy" filled /> Te ven solo como un alias de animalito.
            </li>
            <li>
              <Icon name="quiz" filled /> Si ya entraste, retomas donde te quedaste.
            </li>
            <li>
              <Icon name="logout" filled /> {MATRICULA_COPY.sharedDevice}
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
