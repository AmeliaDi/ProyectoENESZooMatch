"use client";

/**
 * "Tus logros" (M-14): the catalogue of `data/badges.json` painted with the
 * state the server derived from rows it already stores.
 *
 * The grid reads the catalogue, not the payload: names, lines and icons come
 * from the file the copy tests sweep, so a response can never put a sentence
 * on screen that nobody reviewed. A lock is a fact about what the app could
 * count today, which is why the section says so out loud.
 */

import { BADGE_CATALOG, BADGE_SECTION_COPY } from "@/domain/badges/badge-catalog";
import type { BadgeIcon } from "@/domain/badges/badge-types";
import type { IconName } from "@/ui/design/icons";
import { Icon } from "@/ui/kit/icon";
import { Frame } from "@/ui/kit/surfaces";

export interface BadgeGridProps {
  /** Ids the person has, from `GET /api/profile`; empty when nothing unlocked yet. */
  unlocked: readonly string[];
}

/** Each badge keeps its own shape: the grid is read by icon, not by position. */
const BADGE_ICON_MAP: Record<BadgeIcon, IconName> = {
  estrella: "check",
  chat: "chat",
  preguntas: "quiz",
  libertad: "amistad",
  calendario: "notification",
  rompehielos: "help",
};

export function BadgeGrid({ unlocked }: BadgeGridProps) {
  const has = new Set(unlocked);
  const earned = BADGE_CATALOG.filter((badge) => has.has(badge.id));

  return (
    <Frame title={BADGE_SECTION_COPY.title} coord="AR 06h">
      {earned.length === 0 ? <p className="zm-detail__muted">{BADGE_SECTION_COPY.emptyHint}</p> : null}
      <div className="zm-badges">
        <div className="zm-badges__grid" role="list">
          {BADGE_CATALOG.map((badge) => {
            const unlockedNow = has.has(badge.id);
            return (
              <div
                key={badge.id}
                className="zm-box zm-badge"
                data-locked={!unlockedNow}
                role="listitem"
              >
                <span className="zm-badge__icon">
                  <Icon name={BADGE_ICON_MAP[badge.icono]} filled={unlockedNow} />
                </span>
                <span className="zm-badge__label">{badge.nombre}</span>
                <span className="zm-sr-only">
                  {unlockedNow ? BADGE_SECTION_COPY.unlockedLabel : BADGE_SECTION_COPY.lockedLabel}
                </span>
                <p className="zm-badge__desc">{badge.descripcion}</p>
              </div>
            );
          })}
        </div>
      </div>
      <p className="zm-result__fine">{BADGE_SECTION_COPY.derivedNote}</p>
    </Frame>
  );
}
