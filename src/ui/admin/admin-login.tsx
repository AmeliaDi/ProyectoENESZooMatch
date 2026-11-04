"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { ADMIN_CONFIG } from "@/config";
import { sanitizeMatriculaInput } from "@/ui/entry/matricula";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";

import { ADMIN_COPY } from "./admin-copy";

const PIN_LENGTH = ADMIN_CONFIG.pin.length;

function waitMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Demasiados intentos. Vuelve a intentar en ${minutes} min.`;
}

/** Matrícula + admin PIN; the answer never says which of the two failed. */
export function AdminLogin() {
  const router = useRouter();
  const [matricula, setMatricula] = useState("");
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricula, pin }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const retry = body && typeof body === "object" && "retryAfter" in body && typeof body.retryAfter === "number" ? body.retryAfter : null;
        setError(retry ? waitMessage(retry) : ADMIN_COPY.loginInvalid);
        setPin("");
        return;
      }
      router.replace("/admin");
    } catch {
      setError(ADMIN_COPY.loginUnavailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <AtlasShell plate={ADMIN_COPY.plate}>
      <main className="zm-center">
        <form className="zm-box zm-box--frame zm-entry__form" onSubmit={submit} noValidate>
          <h1 className="zm-settings__title">{ADMIN_COPY.loginTitle}</h1>
          <Field
            label={ADMIN_COPY.loginMatricula}
            name="admin-matricula"
            inputMode="numeric"
            autoComplete="off"
            required
            value={matricula}
            onChange={(e) => setMatricula(sanitizeMatriculaInput(e.target.value))}
          />
          <Field
            label={ADMIN_COPY.loginPin}
            name="admin-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            required
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, PIN_LENGTH))}
            error={error}
          />
          <Button type="submit" variant="primary" icon="admin" busy={pending} disabled={pending || pin.length !== PIN_LENGTH}>
            {pending ? ADMIN_COPY.verifying : ADMIN_COPY.enter}
          </Button>
          <p className="zm-detail__muted">{ADMIN_COPY.loginNote}</p>
        </form>
      </main>
    </AtlasShell>
  );
}
