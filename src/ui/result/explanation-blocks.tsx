/**
 * The layered explanation, shared by the list card and the sky's detail
 * sheet. Renders server-computed numbers only:
 *   1. "Lo que más conecta" — layers 1–3 with their real points;
 *   2. "Lo que podrían platicar" — MBTI/Eneagrama, with their tiny weight;
 *   3. tension — the weakest core area, framed as a conversation.
 */

import type { MatchExplanation } from "@/contracts/result";

import { Icon } from "@/ui/kit/icon";

import { WhyBars, formatPoints } from "./why-bars";

export const EXPLANATION_COPY_UI = {
  connects: "Lo que más conecta",
  talk: "Lo que podrían platicar",
  others: "Otras áreas juntas:",
  fine: "Afinidad estimada con un modelo calibrado en datos sintéticos: ordena posibilidades, no predice el futuro.",
} as const;

export function ExplanationBlocks({
  explanation,
  track,
  idPrefix,
}: {
  explanation: MatchExplanation;
  track: "romance" | "amistad";
  idPrefix: string;
}) {
  const { connects, otherPoints, personalityNote, talk, tension } = explanation;
  return (
    <>
      {connects.length > 0 ? (
        <section aria-labelledby={`${idPrefix}-connects`}>
          <h3 id={`${idPrefix}-connects`} className="zm-detail__h">
            {EXPLANATION_COPY_UI.connects}
          </h3>
          {personalityNote ? <p className="zm-detail__muted">{personalityNote}</p> : null}
          <WhyBars entries={connects} max={connects.length} tone={track} />
          {otherPoints > 0 ? (
            <p className="zm-detail__fine">
              {EXPLANATION_COPY_UI.others} <span className="zm-num">+{formatPoints(otherPoints)} pts</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {talk.lines.length > 0 ? (
        <section aria-labelledby={`${idPrefix}-talk`}>
          <h3 id={`${idPrefix}-talk`} className="zm-detail__h">
            {EXPLANATION_COPY_UI.talk}
          </h3>
          <p className="zm-detail__fine">{talk.intro}</p>
          <ul className="zm-detail__talk">
            {talk.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {tension ? (
        <section aria-labelledby={`${idPrefix}-tension`} className="zm-box zm-box--flat zm-detail__tension">
          <h3 id={`${idPrefix}-tension`} className="zm-detail__h">
            <Icon name="tension" filled /> {tension.title}
          </h3>
          <p>
            {tension.text}{" "}
            <span className="zm-detail__muted">
              ({tension.categoryLabel}: {tension.percentage} %)
            </span>
          </p>
        </section>
      ) : null}
    </>
  );
}
