"use client";

import { useId, useState } from "react";

import { formatIdentity } from "@/domain/identity/format-identity";
import type { MatchEntryDto } from "@/contracts/result";
import { isRadiantAffinity } from "@/ui/constellation/render-helpers";
import { categoryIcon } from "@/ui/design/category-icons";
import { Button } from "@/ui/kit/button";
import { PixelNumber } from "@/ui/kit/pixel-number";
import { Chip, Frame } from "@/ui/kit/surfaces";
import type { MatchTrack } from "@/types/microtest";

import { clipName } from "./clip-label";
import { EXPLANATION_COPY_UI, ExplanationBlocks } from "./explanation-blocks";
import { normalizeBadges } from "./parse-result";

const BADGES_SHOWN: Record<MatchTrack, number> = { romance: 5, amistad: 3 };

/** One match in the list view: same data as the sky's detail sheet. */
export function MatchCard({ match, track }: { match: MatchEntryDto; track: MatchTrack }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const explanation = match.explanation;
  const name = formatIdentity(match.identity);
  const percent = Math.round(match.similarity * 100);
  // Wording of every chip comes from the local badge map, never from the payload.
  const badges = normalizeBadges(match.badges).slice(0, BADGES_SHOWN[track]);

  return (
    <Frame as="article" className="zm-match" data-tone={track}>
      <div className="zm-match__head">
        <div>
          <h3 className="zm-match__alias" title={name.title}>{clipName(name.title, 18)}</h3>
          {name.subtitle ? <p className="zm-match__identity">{name.subtitle}</p> : null}
        </div>
        <p className="zm-match__affinity" aria-label={`${percent} % de afinidad estimada`}>
          <strong>
            <PixelNumber value={`${percent}`} size="lg" gold={isRadiantAffinity(match.similarity, track)} />
          </strong>
          <span>% afinidad estimada</span>
        </p>
      </div>
      {explanation ? (
        <Chip icon="confidence">
          {explanation.confidence.label}
        </Chip>
      ) : null}
      {badges.length > 0 ? (
        <ul className="zm-match__badges">
          {badges.map((badge) => (
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
            <p className="zm-detail__muted">{explanation.confidence.reason}</p>
            <ExplanationBlocks explanation={explanation} track={track} idPrefix={detailId} />
            <p className="zm-detail__fine">{EXPLANATION_COPY_UI.fine}</p>
          </div>
        </>
      ) : null}
    </Frame>
  );
}
