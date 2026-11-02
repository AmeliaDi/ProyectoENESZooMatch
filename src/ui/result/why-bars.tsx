/**
 * "Lo que más conecta" as constellation bars: each area is a row of pixel
 * stars lit in proportion to its similarity, and the line also prints the
 * REAL points it adds to the affinity (they sum to the affinity %). Nothing
 * depends on colour or on counting stars.
 */

import type { LayerContribution } from "@/contracts/result";
import { categoryIcon } from "@/ui/design/category-icons";
import { Icon } from "@/ui/kit/icon";

const STARS_PER_BAR = 10;

export function litStars(percentage: number, total = STARS_PER_BAR): number {
  return Math.max(0, Math.min(total, Math.round((percentage / 100) * total)));
}

export function formatPoints(points: number): string {
  return points.toLocaleString("es-MX", { maximumFractionDigits: 1 });
}

export function WhyBars({
  entries,
  max,
  tone,
}: {
  entries: readonly LayerContribution[];
  max: number;
  tone: "romance" | "amistad";
}) {
  return (
    <ul className="zm-why" data-tone={tone}>
      {entries.slice(0, max).map((entry) => {
        const lit = litStars(entry.percentage);
        return (
          <li key={entry.category} className="zm-why__row">
            <div className="zm-why__head">
              <Icon name={categoryIcon(entry.icon || entry.category)} filled />
              <span className="zm-why__label">{entry.label}</span>
              <span className="zm-why__value">+{formatPoints(entry.points)} pts</span>
            </div>
            <svg
              className="zm-why__stars zm-crisp"
              viewBox={`0 0 ${STARS_PER_BAR * 4} 3`}
              role="img"
              aria-label={`${entry.percentage} % de afinidad en ${entry.label.toLowerCase()}; aporta ${formatPoints(entry.points)} puntos`}
            >
              {lit > 1 ? <rect className="zm-why__line" x={1} y={1} width={(lit - 1) * 4} height={1} /> : null}
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
