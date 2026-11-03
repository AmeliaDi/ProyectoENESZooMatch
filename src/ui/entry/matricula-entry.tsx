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
  MATRICULA_DIGITS,
  isPublicMatriculaValid,
  normalizePublicMatricula,
  sanitizeMatriculaInput,
} from "./matricula";
import { type EntryFailure, useEntry } from "./use-entry";

export const MATRICULA_COPY = {
  promise: "Un test anónimo para descubrir con quién del campus podrías hacer constelación.",
  label: "Matrícula (número de cuenta UNAM)",
  intro: `Para entrar solo necesitas tu matrícula: tu número de cuenta UNAM de ${MATRICULA_DIGITS} dígitos, el que viene en tu credencial.`,
  hint: "Es tu llave para volver. Nunca se guarda ni se muestra: solo un resumen cifrado que no se puede revertir.",
  invalid: `Escribe tu número de cuenta completo: ${MATRICULA_DIGITS} números, sin letras ni guiones.`,
  ownOnly: "Usa solo tu propia matrícula: con ella se abre tu perfil y nadie más debería usarla.",
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

function fieldError(failed: EntryFailure | null, touched: boolean, matricula: string): string | null {
  if (failed) return MATRICULA_COPY[failed];
  return touched && !isPublicMatriculaValid(matricula) ? MATRICULA_COPY.invalid : null;
}

export function MatriculaEntry() {
  const inclusiveMode = useInclusiveMode();
  const deleted = useDeletedNotice();
  const { enter, submitting, failed, clearFailure } = useEntry(inclusiveMode);
  const [matricula, setMatricula] = useState("");
  const [touched, setTouched] = useState(false);
  const error = fieldError(failed, touched, matricula);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!isPublicMatriculaValid(matricula)) return;
    void enter(normalizePublicMatricula(matricula));
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
          <p className="zm-entry__intro">{MATRICULA_COPY.intro}</p>
          <Field
            label={MATRICULA_COPY.label}
            hint={MATRICULA_COPY.hint}
            error={error}
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
            <li>
              <Icon name="privacy" filled /> {MATRICULA_COPY.ownOnly}
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
