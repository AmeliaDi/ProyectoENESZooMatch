"use client";

/**
 * Badge grid component for the profile page.
 * Shows all badges with their unlock state. Locked badges are dimmed.
 * Newly unlocked badges play a CSS animation.
 */

import { BADGE_CATALOG, BADGE_SECTION_COPY } from "@/domain/badges/badge-catalog";
import type { BadgeDisplay } from "@/domain/badges/badge-types";
import { Icon } from "@/ui/kit/icon";
import { Frame } from "@/ui/kit/surfaces";

export interface BadgeGridProps {
  /** All badges with their current unlock state. */
  badges: readonly BadgeDisplay[];
  /** Badge that was just unlocked (for animation). Null if none. */
  justUnlocked: string | null;
}

/** Map badge icon names to the closest existing icon in the system. */
const BADGE_ICON_MAP: Record<string, string> = {
  estrella: "check",
  chat: "chat",
  preguntas: "quiz",
  libertad: "amistad",
  calendario: "notification",
};

export function BadgeGrid({ badges, justUnlocked }: BadgeGridProps) {
  const displayBadges = badges.length > 0 ? badges : buildDefaultBadges();

  return (
    <Frame title={BADGE_SECTION_COPY.title} coord="AR 05h">
      <div className="zm-badges">
        <div className="zm-badges__grid">
          {displayBadges.map((badge) => {
            const isUnlocking = justUnlocked === badge.id;
            const iconName = BADGE_ICON_MAP[badge.icono] ?? "info";
            return (
              <div
                key={badge.id}
                className={`zm-box zm-badge${isUnlocking ? " zm-badge--unlocking" : ""}`}
                data-locked={!badge.unlocked}
                role="status"
                aria-label={`${badge.nombre}: ${badge.unlocked ? BADGE_SECTION_COPY.unlockedLabel : BADGE_SECTION_COPY.lockedLabel}`}
              >
                <span className="zm-badge__icon">
                  <Icon name={iconName as "check"} filled={badge.unlocked} />
                </span>
                <span className="zm-badge__label">{badge.nombre}</span>
                <p className="zm-badge__desc">{badge.descripcion}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}

/** Build default badge display list from catalog (all locked). */
function buildDefaultBadges(): BadgeDisplay[] {
  return BADGE_CATALOG.map((def) => ({
    id: def.id,
    nombre: def.nombre,
    descripcion: def.descripcion,
    icono: def.icono,
    unlocked: false,
    desbloqueadoEn: null,
  }));
}
