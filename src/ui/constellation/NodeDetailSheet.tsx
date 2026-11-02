"use client";

/**
 * NodeDetailSheet — what you learn when you tap a star. Built on the kit's
 * native `<dialog>` (bottom sheet on mobile, side panel on desktop), so focus
 * trap, Escape and focus return come from the platform.
 *
 * Every number and sentence was computed on the server by the explainability
 * engine; the sheet renders it and computes nothing.
 */

import { useMemo } from "react";

import { EXPERIENCE } from "@/config";
import { categoryIcon } from "@/ui/design/category-icons";
import { Chip } from "@/ui/kit/surfaces";
import { Dialog } from "@/ui/kit/dialog";
import { Icon } from "@/ui/kit/icon";
import { WhyBars } from "@/ui/result/why-bars";

import { PixelAnimal } from "./PixelAnimal";
import { RomanceDuo } from "./RomanceHearts";
import { formatAffinityPercent, sliceBadges } from "./render-helpers";
import { CONSTELLATION_COPY, type NodeDetailSheetProps } from "./types";

export function NodeDetailSheet({ node, self, track, reducedMotion, onClose }: NodeDetailSheetProps) {
  const badges = useMemo(() => (node ? sliceBadges(node.badges, track) : []), [node, track]);
  const explanation = node?.explanation ?? null;
  const confidence = explanation?.confidence ?? null;
  const tension = explanation?.tension ?? null;
  const duo = track === "romance" && (node?.chemistry?.percentage ?? 0) >= 70;
  const identity = node ? `${node.animalName} ${node.colorName}`.trim() : "";
  const rationale =
    track === "romance"
      ? explanation?.porQuePosibleRomance ?? explanation?.porQueFunciona
      : explanation?.porQueBuenaAmistad ?? explanation?.porQueFunciona;

  return (
    <Dialog open={node !== null} onClose={onClose} title={node?.alias ?? ""} kind="sheet" closeLabel={CONSTELLATION_COPY.closeSheet}>
      {node ? (
        <div className="zm-detail" data-tone={track}>
          <div className="zm-detail__hero">
            <div className="zm-box zm-box--flat zm-detail__sprite" aria-hidden="true">
              {duo ? (
                <RomanceDuo
                  selfAnimalId={self.animalId}
                  selfColorId={self.colorId}
                  selfMark={self.mark}
                  matchAnimalId={node.animalId}
                  matchColorId={node.colorId}
                  matchMark={node.mark}
                  size={42}
                  animated={!reducedMotion}
                />
              ) : (
                <PixelAnimal animalId={node.animalId} colorId={node.colorId} mark={node.mark} happy size={64} animated={!reducedMotion} />
              )}
            </div>
            <div>
              <p className="zm-eyebrow">
                {track === "romance" ? CONSTELLATION_COPY.sheetEyebrowRomance : CONSTELLATION_COPY.sheetEyebrowAmistad}
              </p>
              <p className="zm-detail__identity">{identity}</p>
              <p className="zm-detail__affinity">
                <strong>{formatAffinityPercent(node.similarity)} %</strong> de afinidad estimada
              </p>
              {confidence ? (
                <Chip tone="gold" icon="confidence">
                  {confidence.label}
                </Chip>
              ) : null}
            </div>
          </div>
          {confidence ? <p className="zm-detail__muted">{confidence.reason}</p> : null}

          {explanation?.headline ? <p className="zm-detail__headline">{explanation.headline}</p> : null}

          {explanation && explanation.breakdown.length > 0 ? (
            <section aria-labelledby="detail-why">
              <h3 id="detail-why" className="zm-detail__h">
                Por qué conectan
              </h3>
              {rationale ? <p className="zm-detail__muted">{rationale}</p> : null}
              <WhyBars entries={explanation.breakdown} max={EXPERIENCE.result.detailBreakdownMax} tone={track} />
            </section>
          ) : null}

          {tension ? (
            <section aria-labelledby="detail-tension" className="zm-box zm-box--flat zm-detail__tension">
              <h3 id="detail-tension" className="zm-detail__h">
                <Icon name="tension" filled /> {tension.complementary ? "Tensión sana" : "Algo para platicar"}
              </h3>
              <p>
                {tension.text} <span className="zm-detail__muted">({tension.categoryLabel}: {tension.percentage} %)</span>
              </p>
            </section>
          ) : null}

          {badges.length > 0 ? (
            <section aria-labelledby="detail-badges">
              <h3 id="detail-badges" className="zm-detail__h">
                {CONSTELLATION_COPY.sheetBadgesTitle}
              </h3>
              <ul className="zm-detail__badges">
                {badges.map((badge) => (
                  <li key={badge.dimension}>
                    <Chip tone={track} icon={categoryIcon(badge.icon || badge.dimension)}>
                      {badge.label}
                    </Chip>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {explanation?.dinamicaCotidiana ? (
            <section aria-labelledby="detail-daily">
              <h3 id="detail-daily" className="zm-detail__h">
                {CONSTELLATION_COPY.sheetDailyTitle}
              </h3>
              <p className="zm-detail__muted">{explanation.dinamicaCotidiana}</p>
            </section>
          ) : null}

          <section aria-labelledby="detail-contact" className="zm-box zm-box--flat zm-detail__contact">
            <h3 id="detail-contact" className="zm-detail__h">
              <Icon name="privacy" filled /> Contacto con consentimiento
            </h3>
            <p className="zm-detail__muted">
              Muy pronto podrás decir “me interesa conocerte”. Solo se abre un canal si las dos personas
              lo eligen, y puedes retirarte sin explicar nada.
            </p>
          </section>

          <p className="zm-detail__fine">Afinidad estimada a partir del test, no una predicción.</p>
        </div>
      ) : null}
    </Dialog>
  );
}

export default NodeDetailSheet;
