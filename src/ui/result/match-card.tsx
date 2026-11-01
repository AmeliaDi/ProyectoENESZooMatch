"use client";

import { useId, useState } from "react";

import { EXPERIENCE } from "@/config";
import { categoryIcon } from "@/ui/design/category-icons";
import { Button } from "@/ui/kit/button";
import { Chip, Frame } from "@/ui/kit/surfaces";
import type { MatchTrack } from "@/types/microtest";

import type { ResultMatch } from "./parse-result";
import { WhyBars } from "./why-bars";

const BADGES_SHOWN: Record<MatchTrack, number> = { romance: 5, amistad: 3 };

/** One match in the list view: same data as the sky's detail sheet. */
export function MatchCard({ match, track }: { match: ResultMatch; track: MatchTrack }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const explanation = match.explanation;
  const percent = Math.round(match.similarity * 100);

  return (
    <Frame as="article" className="zm-match" data-tone={track}>
      <div className="zm-match__head">
        <div>
          <h3 className="zm-match__alias">{match.alias}</h3>
          <p className="zm-match__identity">
            {match.animal} {match.color}
          </p>
        </div>
        <p className="zm-match__affinity" aria-label={`${percent} % de afinidad estimada`}>
          <strong>{percent}</strong>
          <span>% afinidad estimada</span>
        </p>
      </div>
      {explanation?.confidence ? (
        <Chip tone="gold" icon="confidence">
          {explanation.confidence.label}
        </Chip>
      ) : null}
      {match.badges.length > 0 ? (
        <ul className="zm-match__badges">
          {match.badges.slice(0, BADGES_SHOWN[track]).map((badge) => (
            <li key={badge.dimension}>
              <Chip tone={track} icon={categoryIcon(badge.icon || badge.dimension)}>
                {badge.label}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
      {explanation ? (
        <>
          <Button
            variant="ghost"
            icon={open ? "close" : "info"}
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Cerrar" : "Ver por qué"}
          </Button>
          <div id={detailId} hidden={!open} className="zm-match__detail">
            {explanation.headline ? <p className="zm-detail__headline">{explanation.headline}</p> : null}
            <WhyBars entries={explanation.breakdown} max={EXPERIENCE.result.detailBreakdownMax} tone={track} />
            {explanation.tension ? (
              <p className="zm-detail__muted">
                <strong>{explanation.tension.complementary ? "Tensión sana. " : "Algo para platicar. "}</strong>
                {explanation.tension.text}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </Frame>
  );
}
