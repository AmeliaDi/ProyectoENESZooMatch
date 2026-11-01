/**
 * "Por qué son compatibles" as constellation bars: each category is a row of
 * pixel stars, lit in proportion to its real percentage from the domain. The
 * number is printed too, so nothing depends on colour or counting stars.
 */

import type { AffinityBreakdown } from "@/contracts/result";
import { categoryIcon } from "@/ui/design/category-icons";
import { Icon } from "@/ui/kit/icon";

const STARS_PER_BAR = 10;

export function litStars(percentage: number, total = STARS_PER_BAR): number {
  return Math.max(0, Math.min(total, Math.round((percentage / 100) * total)));
}

export function WhyBars({
  entries,
  max,
  tone,
}: {
  entries: readonly AffinityBreakdown[];
  max: number;
  tone: "romance" | "amistad";
}) {
  const top = [...entries].sort((a, b) => b.percentage - a.percentage).slice(0, max);
  return (
    <ul className="zm-why" data-tone={tone}>
      {top.map((entry) => {
        const lit = litStars(entry.percentage);
        return (
          <li key={entry.category} className="zm-why__row">
            <div className="zm-why__head">
              <Icon name={categoryIcon(entry.icon || entry.category)} filled />
              <span className="zm-why__label">{entry.categoryLabel}</span>
              <span className="zm-why__value">{entry.percentage} %</span>
            </div>
            <svg
              className="zm-why__stars zm-crisp"
              viewBox={`0 0 ${STARS_PER_BAR * 4} 3`}
              role="img"
              aria-label={`${entry.percentage} % de afinidad en ${entry.categoryLabel.toLowerCase()}`}
            >
              {lit > 1 ? (
                <rect className="zm-why__line" x={1} y={1} width={(lit - 1) * 4} height={1} />
              ) : null}
              {Array.from({ length: STARS_PER_BAR }, (_, i) => (
                <rect key={i} className="zm-why__star" data-on={i < lit} x={i * 4} y={0} width={3} height={3} />
              ))}
            </svg>
            <p className="zm-why__phrase">{entry.phrase}</p>
          </li>
        );
      })}
    </ul>
  );
}
