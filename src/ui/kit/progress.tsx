import { progressStars } from "@/ui/design/shapes";

export interface ConstellationProgressProps {
  total: number;
  answered: number;
  /** Index of the item on screen (gets the blinking gold star). */
  current?: number;
  label?: string;
}

const BAND_WIDTH = 180;
const BAND_HEIGHT = 14;

/**
 * Progress as your own constellation: one star per item, lit as you answer,
 * joined by a pixel line up to the last lit star. No timer, no percentage race.
 */
export function ConstellationProgress({ total, answered, current, label = "Tu constelación" }: ConstellationProgressProps) {
  const stars = progressStars(total, BAND_WIDTH, BAND_HEIGHT);
  const lit = Math.max(0, Math.min(answered, total));
  const path = stars
    .slice(0, lit)
    .map((star, i) => `${i === 0 ? "M" : "L"}${star.x + 0.5} ${star.y + 0.5}`)
    .join("");
  return (
    <div>
      <svg
        className="zm-progress zm-crisp"
        viewBox={`0 0 ${BAND_WIDTH} ${BAND_HEIGHT}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={lit}
        aria-valuetext={`${lit} de ${total} estrellas encendidas`}
      >
        {lit > 1 ? <path className="zm-progress__line" d={path} fill="none" strokeWidth={0.5} strokeDasharray="1 1" /> : null}
        {stars.map((star, index) => (
          <rect
            key={index}
            className="zm-progress__star"
            data-on={index < lit}
            data-current={index === current}
            x={star.x}
            y={star.y}
            width={star.size}
            height={star.size}
          />
        ))}
      </svg>
      <p className="zm-progress__label zm-num" aria-hidden="true">
        {lit} / {total}
      </p>
    </div>
  );
}
