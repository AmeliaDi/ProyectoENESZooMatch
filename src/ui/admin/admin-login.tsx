"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

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
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 429
            ? "Demasiados intentos. Espera antes de volver a intentar."
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
    <main className="admin-shell grid min-h-screen place-items-center overflow-hidden px-5 py-10 text-[#eef2e3]">
      <div className="admin-grid" aria-hidden="true" />
      <div className="admin-orbit admin-orbit-a" aria-hidden="true" />
      <div className="admin-orbit admin-orbit-b" aria-hidden="true" />

      <section className="admin-reveal relative z-10 w-full max-w-[64rem] border border-[#9dbb63]/25 bg-[#0b100e]/90 shadow-[0_2rem_7rem_rgba(0,0,0,0.55)] backdrop-blur-xl lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden min-h-[38rem] overflow-hidden border-r border-[#9dbb63]/20 p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-[#c7e879]">
              ZooMatch / Observatorio
            </p>
            <h1 className="mt-8 max-w-md font-display text-7xl leading-[0.82] tracking-[-0.06em]">
              Acceso de
              <span className="block italic text-[#c7e879]">campo.</span>
            </h1>
          </div>
          <div className="max-w-sm border-l border-[#c7e879]/45 pl-5 text-sm leading-6 text-[#9ca9a1]">
            Sesión individual de Supabase. La autorización se confirma contra el rol administrativo antes de exponer agregados.
          </div>
          <span className="absolute -bottom-10 -right-7 font-display text-[13rem] leading-none text-[#c7e879]/[0.035]" aria-hidden="true">
            16
          </span>
        </div>

        <div className="p-6 sm:p-10 lg:p-12">
          <div className="mb-10 flex items-center justify-between border-b border-white/10 pb-5">
            <div>
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-[#718079]">Terminal privada</p>
              <h2 className="mt-2 font-display text-4xl tracking-[-0.04em]">Identificación</h2>
            </div>
            <span className="admin-pulse h-2.5 w-2.5 rounded-full bg-[#c7e879]" aria-hidden="true" />
          </div>

          <form onSubmit={submit} className="space-y-7" noValidate>
            <div>
              <label htmlFor="admin-email" className="font-mono text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[#9ca9a1]">
                Correo administrativo
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                maxLength={254}
                className="mt-3 w-full border-0 border-b border-white/20 bg-transparent px-0 py-4 text-lg text-white outline-none transition-colors placeholder:text-white/20 focus:border-[#c7e879] focus-visible:ring-0"
                placeholder="admin@institucion.mx"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="font-mono text-[0.63rem] font-bold uppercase tracking-[0.2em] text-[#9ca9a1]">
                Contraseña
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                className="mt-3 w-full border-0 border-b border-white/20 bg-transparent px-0 py-4 text-lg text-white outline-none transition-colors placeholder:text-white/20 focus:border-[#c7e879] focus-visible:ring-0"
                placeholder="••••••••••••"
              />
            </div>

            <div role="alert" aria-live="polite" className="min-h-12 text-sm leading-6 text-[#f3a989]">
              {error}
            </div>

            <button
              type="submit"
              disabled={pending}
              className="group flex min-h-14 w-full items-center justify-between bg-[#c7e879] px-5 py-4 text-left font-mono text-xs font-bold uppercase tracking-[0.17em] text-[#0b100e] outline-none transition hover:bg-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b100e] disabled:cursor-wait disabled:opacity-50"
            >
              <span>{pending ? "Verificando credenciales" : "Abrir observatorio"}</span>
              <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
            </button>
          </form>

          <p className="mt-7 text-xs leading-5 text-[#718079]">
            No existe una contraseña compartida. Los intentos se limitan y la sesión se valida en el servidor.
          </p>
        </div>
      </section>
    </main>
  );
}
