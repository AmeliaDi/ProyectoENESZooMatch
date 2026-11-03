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

import { categoryIcon } from "@/ui/design/category-icons";
import { Chip } from "@/ui/kit/surfaces";
import { Dialog } from "@/ui/kit/dialog";
import { Icon } from "@/ui/kit/icon";
import { PixelNumber } from "@/ui/kit/pixel-number";
import { EXPLANATION_COPY_UI, ExplanationBlocks } from "@/ui/result/explanation-blocks";

import { LayerAffinity, SharedReadings } from "./layer-affinity";
import { PixelAnimal } from "./PixelAnimal";
import { RomanceDuo } from "./RomanceHearts";
import { formatAffinityPercent, isRadiantAffinity, sliceBadges } from "./render-helpers";
import { CONSTELLATION_COPY, type NodeDetailSheetProps } from "./types";

export function NodeDetailSheet({ node, self, track, reducedMotion, onClose }: NodeDetailSheetProps) {
  const badges = useMemo(() => (node ? sliceBadges(node.badges, track) : []), [node, track]);
  const explanation = node?.explanation ?? null;
  const confidence = explanation?.confidence ?? null;
  const duo = track === "romance" && (node?.chemistry?.percentage ?? 0) >= 70;
  const identity = node ? `${node.animalName} ${node.colorName}`.trim() : "";

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
                <strong>
                  <PixelNumber value={`${formatAffinityPercent(node.similarity)} %`} size="md" gold={isRadiantAffinity(node.similarity)} />
                </strong>{" "}
                de afinidad estimada
              </p>
              {confidence ? (
                <Chip icon="confidence">
                  {confidence.label}
                </Chip>
              ) : null}
            </div>
          </div>
          {confidence ? <p className="zm-detail__muted">{confidence.reason}</p> : null}

          {explanation?.headline ? <p className="zm-detail__headline">{explanation.headline}</p> : null}

          {explanation ? <ExplanationBlocks explanation={explanation} track={track} idPrefix="detail" /> : null}

          <LayerAffinity layers={node.layers ?? []} idPrefix="detail" />
          <SharedReadings shared={node.shared} idPrefix="detail" />

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

          <section aria-labelledby="detail-contact" className="zm-box zm-box--flat zm-detail__contact">
            <h3 id="detail-contact" className="zm-detail__h">
              <Icon name="privacy" filled /> Contacto con consentimiento
            </h3>
            <p className="zm-detail__muted">
              Muy pronto podrás decir “me interesa conocerte”. Solo se abre un canal si las dos personas
              lo eligen, y puedes retirarte sin explicar nada.
            </p>
          </section>

          <p className="zm-detail__fine">{EXPLANATION_COPY_UI.fine}</p>
        </div>
      ) : null}
    </Dialog>
  );
}

export default NodeDetailSheet;
