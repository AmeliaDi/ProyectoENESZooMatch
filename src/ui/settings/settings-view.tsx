"use client";

/**
 * Ajustes y privacidad: preferences that live on this device (cielo,
 * lenguaje, avisos) and the two account actions with real backend (pausar
 * perfil, borrar mis datos). Plain language, no dark patterns: deleting asks
 * once, clearly, and says it cannot be undone.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MATCHING_CONFIG } from "@/config";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Button } from "@/ui/kit/button";
import { Dialog } from "@/ui/kit/dialog";
import { Icon } from "@/ui/kit/icon";
import { Frame } from "@/ui/kit/surfaces";
import { InclusiveModeSelector } from "@/ui/shared/inclusive-mode-selector";
import { useNotificationsPaused } from "@/ui/shared/notification-provider";
import { writeNotificationsPaused } from "@/ui/shared/notification-grouping";
import { ThemeSelector } from "@/ui/shared/theme-selector";

type Account =
  | { state: "loading" }
  | { state: "guest" }
  | { state: "ready"; paused: boolean; showAvatarDetail: boolean };

/** One-shot flag read by the entry scene to confirm the deletion. */
export const DELETED_FLAG = "zoomatch:data-deleted";

const pct = (value: number) => `${Math.round(value * 100)} %`;

function useAccount() {
  const [account, setAccount] = useState<Account>({ state: "loading" });
  useEffect(() => {
    let active = true;
    fetch("/api/privacy", { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        const body = (await res.json().catch(() => null)) as { paused?: unknown; showAvatarDetail?: unknown } | null;
        setAccount(
          res.ok && typeof body?.paused === "boolean"
            ? { state: "ready", paused: body.paused, showAvatarDetail: body.showAvatarDetail === true }
            : { state: "guest" },
        );
      })
      .catch(() => active && setAccount({ state: "guest" }));
    return () => {
      active = false;
    };
  }, []);
  return [account, setAccount] as const;
}

export function SettingsView() {
  const router = useRouter();
  const [account, setAccount] = useAccount();
  const notificationsPaused = useNotificationsPaused();
  const [busy, setBusy] = useState<"pause" | "detail" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function togglePause() {
    if (account.state !== "ready") return;
    setBusy("pause");
    setMessage(null);
    const next = !account.paused;
    const res = await fetch("/api/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: next }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setAccount({ ...account, paused: next });
      setMessage(next ? "Tu perfil está en pausa: nadie te ve y no apareces en cielos ajenos." : "Tu perfil vuelve a brillar.");
    } else {
      setMessage("No pudimos guardar el cambio. Intenta de nuevo en un momento.");
    }
  }

  async function toggleDetail() {
    if (account.state !== "ready") return;
    setBusy("detail");
    setMessage(null);
    const next = !account.showAvatarDetail;
    const res = await fetch("/api/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showAvatarDetail: next }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) {
      setAccount({ ...account, showAvatarDetail: next });
      setMessage(next ? "Ahora otras personas ven el tono de tu ala y tu marca." : "Otras personas solo ven tu animalito y tu color base.");
    } else {
      setMessage("No pudimos guardar el cambio. Intenta de nuevo en un momento.");
    }
  }

  async function deleteData() {
    setBusy("delete");
    const res = await fetch("/api/privacy", { method: "DELETE" }).catch(() => null);
    setBusy(null);
    setConfirming(false);
    if (res?.ok) {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.sessionStorage.setItem(DELETED_FLAG, "1");
      } catch {
        // Nothing else to clean.
      }
      router.replace("/");
      return;
    }
    setMessage("No pudimos borrar tus datos ahora. Nada se perdió; intenta en un momento.");
  }

  return (
    <AtlasShell
      plate="Lámina 05 · ajustes"
      actions={
        <Link href="/resultado" className="zm-box zm-btn zm-btn--ghost zm-btn--icon" aria-label="Volver a mi cielo">
          <Icon name="back" />
        </Link>
      }
    >
      <main className="zm-settings">
        <h1 className="zm-settings__title">Ajustes y privacidad</h1>

        <Frame title="En este dispositivo" coord="AR 02h">
          <ThemeSelector />
          <InclusiveModeSelector />
          <div className="zm-setting">
            <p className="zm-setting__label">Avisos</p>
            <Button
              variant="secondary"
              icon={notificationsPaused ? "notification" : "pause"}
              aria-pressed={notificationsPaused}
              onClick={() => writeNotificationsPaused(!notificationsPaused)}
            >
              {notificationsPaused ? "Reanudar avisos" : "Pausar avisos"}
            </Button>
          </div>
          <p className="zm-detail__muted">Sonido y vibración vienen apagados; podrás activarlos aquí más adelante.</p>
        </Frame>

        <Frame title="Tu perfil" coord="AR 07h">
          {account.state === "loading" ? <p className="zm-detail__muted">Revisando tu perfil…</p> : null}
          {account.state === "guest" ? (
            <p className="zm-detail__muted">
              Entra con tu matrícula para pausar tu perfil o borrar tus datos. <Link href="/">Ir a la entrada</Link>
            </p>
          ) : null}
          {account.state === "ready" ? (
            <div className="zm-settings__account">
              <div className="zm-setting">
                <p className="zm-setting__label">Tu carta</p>
                <p className="zm-detail__muted">
                  Tus resultados completos, cuando quieras: HEXACO, MBTI, eneagrama, valores, virtudes y afinidades.
                </p>
                <Link href="/perfil" className="zm-box zm-btn zm-btn--secondary">
                  Ver mi carta
                </Link>
              </div>
              <div className="zm-setting">
                <p className="zm-setting__label">{account.paused ? "Perfil en pausa" : "Perfil visible"}</p>
                <p className="zm-detail__muted">
                  Pausar te saca del cálculo de afinidades sin borrar nada. Puedes volver cuando quieras.
                </p>
                <Button variant="secondary" icon="pause" busy={busy === "pause"} disabled={busy !== null} onClick={() => void togglePause()}>
                  {account.paused ? "Reactivar mi perfil" : "Pausar mi perfil"}
                </Button>
              </div>
              <div className="zm-setting">
                <p className="zm-setting__label">
                  {account.showAvatarDetail ? "Detalle de tu animalito visible" : "Detalle de tu animalito oculto"}
                </p>
                <p className="zm-detail__muted">
                  Siempre se ve tu animalito y tu color base. El tono de tu ala y la marca de tu subtipo solo los ven
                  otras personas si lo activas: con pocas personas en el campus, cada detalle extra te hace más
                  reconocible.
                </p>
                <Button
                  variant="secondary"
                  aria-pressed={account.showAvatarDetail}
                  busy={busy === "detail"}
                  disabled={busy !== null}
                  onClick={() => void toggleDetail()}
                >
                  {account.showAvatarDetail ? "Ocultar el detalle" : "Mostrar el detalle"}
                </Button>
              </div>
              <div className="zm-setting">
                <p className="zm-setting__label">Borrar mis datos</p>
                <p className="zm-detail__muted">Borra tu perfil, tus respuestas, tus afinidades y tus avisos.</p>
                <Button variant="danger" icon="delete" disabled={busy !== null} onClick={() => setConfirming(true)}>
                  Borrar mis datos
                </Button>
              </div>
            </div>
          ) : null}
          <p role="status" aria-live="polite" className="zm-settings__message">
            {message}
          </p>
        </Frame>

        <Frame title="Cómo se calcula" coord="AR 11h" id="como-se-calcula">
          <ol className="zm-settings__steps">
            <li>
              Tus respuestas estiman tu perfil por áreas (personalidad HEXACO, valores, estilo de vida, forma de
              relacionarte) junto con qué tan segura es cada estimación. Si contestas menos, el perfil se vuelve más
              prudente; nunca se inventan respuestas.
            </li>
            <li>
              Se compara tu perfil con el de cada persona área por área. Cuenta sobre todo lo que la evidencia respalda
              (personalidad y valores); MBTI y eneagrama dan forma a tu animalito y casi no pesan en el puntaje.
            </li>
            <li>
              Una afinidad necesita ir bien en todas las áreas centrales, no solo en promedio. Solo aparece si supera
              un umbral calibrado para que pocas coincidencias sean fruto del azar: {pct(MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive)} en
              romance y {pct(MATCHING_CONFIG.tracks.amistad.minimum_similarity_exclusive)} en amistad. Romance además
              respeta orientación, identidad y tipo de relación de ambas personas.
            </li>
            <li>La confianza es “alta” solo si la afinidad supera el umbral con holgura y ningún área queda baja.</li>
          </ol>
          <p className="zm-detail__muted">
            Es una estimación estadística sin validación con parejas reales: no predice relaciones y no mide tu valor.
          </p>
        </Frame>
      </main>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="¿Borrar tus datos?" kind="modal">
        <p>Esto borra tu perfil y tus respuestas. No se puede deshacer.</p>
        <div className="zm-settings__confirm">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Conservar mis datos
          </Button>
          <Button variant="danger" icon="delete" busy={busy === "delete"} disabled={busy !== null} onClick={() => void deleteData()}>
            Borrar mis datos
          </Button>
        </div>
      </Dialog>
    </AtlasShell>
  );
}
