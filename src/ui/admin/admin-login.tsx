"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";

export function AdminLogin() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "Demasiados intentos. Espera un momento antes de volver a intentar."
            : "No se pudo verificar el acceso administrativo.",
        );
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("El servicio de acceso no está disponible en este momento.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AtlasShell plate="Observatorio · acceso">
      <main className="zm-center">
        <form className="zm-box zm-box--frame zm-entry__form" onSubmit={submit} noValidate>
          <h1 className="zm-settings__title">Acceso al observatorio</h1>
          <Field label="Correo administrativo" name="email" type="email" autoComplete="username" inputMode="email" required maxLength={254} />
          <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required maxLength={128} error={error} />
          <Button type="submit" variant="primary" icon="admin" busy={pending} disabled={pending}>
            {pending ? "Verificando" : "Entrar"}
          </Button>
          <p className="zm-detail__muted">
            Sesión individual; el rol se confirma en el servidor antes de mostrar agregados.
          </p>
        </form>
      </main>
    </AtlasShell>
  );
}
