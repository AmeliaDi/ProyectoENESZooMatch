/**
 * "¿Quieres afinar tu perfil?": an invitation, never a requirement. Shows the
 * suggested next module (interests first for friendship) and the full menu.
 * Copy is calm: no streaks, no percentages of "incompleteness", no guilt.
 */
import Link from "next/link";

import type { MatchTrack } from "@/types/microtest";
import { Icon } from "@/ui/kit/icon";
import { Frame } from "@/ui/kit/surfaces";

import { moduleMenu, suggestionFor } from "./refine-flow";

export const REFINE_COPY = {
  title: "¿Quieres afinar tu perfil?",
  body: "Es opcional y puedes hacerlo cuando quieras. Más respuestas reducen la incertidumbre de tus estimaciones.",
  note: "Tu animalito puede volverse más específico al afinar. Tu avance se guarda en este dispositivo.",
  allDone: "Ya respondiste todos los módulos. Gracias por el tiempo que le dedicaste.",
  cta: "Empezar",
} as const;

export function RefineInvite({ track, completed }: { track: MatchTrack; completed: readonly string[] }) {
  const next = suggestionFor(track, completed);
  const menu = moduleMenu(track, completed);
  return (
    <Frame title={REFINE_COPY.title} coord="AR 05h">
      {next === null ? (
        <p className="zm-detail__muted">{REFINE_COPY.allDone}</p>
      ) : (
        <>
          <p className="zm-detail__muted">{REFINE_COPY.body}</p>
          <ul className="zm-refine__list">
            {menu.map((m) => (
              <li key={m.id} className="zm-refine__item" data-done={m.done} data-next={m.id === next}>
                <Icon name={m.done ? "check" : "loading"} filled={m.done} />
                <span className="zm-refine__text">
                  <span className="zm-refine__name">{m.titulo}</span>
                  <span className="zm-detail__fine">
                    {m.descripcion} · {m.items} preguntas
                  </span>
                </span>
                {m.done ? (
                  <span className="zm-detail__fine">Listo</span>
                ) : (
                  <Link
                    href={`/afinar?modulo=${m.id}`}
                    className={`zm-box zm-btn ${m.id === next ? "zm-btn--secondary" : "zm-btn--ghost"}`}
                    aria-label={`${REFINE_COPY.cta}: ${m.titulo}`}
                  >
                    {REFINE_COPY.cta}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="zm-detail__fine">{REFINE_COPY.note}</p>
        </>
      )}
    </Frame>
  );
}
