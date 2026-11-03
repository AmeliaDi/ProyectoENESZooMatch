"use client";

/**
 * Quick guide over the constellation. Never modal: the dimmed layer and the
 * gold halo are `pointer-events: none`, so the sky keeps answering drags,
 * taps and pinches while the guide is up. Mobile gets a small card anchored
 * to the bottom (four steps); a fine pointer gets one small tooltip.
 */

import Link from "next/link";
import { useId, type CSSProperties } from "react";

import { Button, IconButton } from "@/ui/kit/button";
import { useReducedMotionPreference } from "@/ui/constellation/hooks";

import { COACH_COPY, COACH_DESKTOP_TIPS, COACH_LINKS, COACH_STEP_COPY, coachAnnouncement, stepLabel } from "./coach-copy";
import { useCoachTarget } from "./coach-hooks";
import { CoachFinger } from "./CoachFinger";
import { currentStep, holeClipPath, isLastStep, stepCount, type Box } from "./coachmarks";
import { useCoachmarks, type CoachController } from "./use-coachmarks";

function boxStyle(box: Box): CSSProperties {
  return { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` };
}

function CoachSpotlight({ box }: { box: Box | null }) {
  return (
    <div className="zm-coach-layer" aria-hidden="true">
      <div className="zm-coach-dim" style={box ? { clipPath: holeClipPath(box) } : undefined} />
      {box ? <div className="zm-coach-halo" style={boxStyle(box)} /> : null}
    </div>
  );
}

function CoachSupport() {
  return (
    <div className="zm-coach-support">
      <p>{COACH_COPY.anonymity}</p>
      <p>
        <Link href={COACH_LINKS.how}>{COACH_COPY.how}</Link> · <Link href={COACH_LINKS.share}>{COACH_COPY.share}</Link>
      </p>
    </div>
  );
}

function CardActions({ coach, last }: { coach: CoachController; last: boolean }) {
  return (
    <div className="zm-coach-card__actions">
      <Button variant="ghost" className="zm-coach-card__never" onClick={() => coach.close("never")}>
        {COACH_COPY.never}
      </Button>
      <div className="zm-coach-card__nav">
        {coach.state.step > 0 ? <Button onClick={coach.back}>{COACH_COPY.back}</Button> : null}
        <Button id={coach.primaryId} variant="primary" iconAfter={last ? "check" : "next"} onClick={coach.next}>
          {last ? COACH_COPY.done : COACH_COPY.next}
        </Button>
      </div>
    </div>
  );
}

function CoachCard({ coach, reducedMotion }: { coach: CoachController; reducedMotion: boolean }) {
  const titleId = useId();
  const step = currentStep(coach.state);
  if (!step) return null;
  const copy = COACH_STEP_COPY[step.id];
  const last = isLastStep(coach.state);
  return (
    <div className="zm-box zm-box--frame zm-coach-card" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className="zm-coach-card__head">
        <p className="zm-coach-card__count zm-num">{stepLabel(coach.state.step, stepCount(coach.state.variant))}</p>
        <IconButton icon="close" label={COACH_COPY.skip} onClick={() => coach.close("skip")} />
      </div>
      <h2 id={titleId} className="zm-coach-card__title">
        {copy.title}
      </h2>
      <p className="zm-coach-card__body">{copy.body}</p>
      {step.art === "drag" ? <CoachFinger still={reducedMotion} /> : null}
      {last ? <CoachSupport /> : null}
      <CardActions coach={coach} last={last} />
    </div>
  );
}

function CoachTip({ coach }: { coach: CoachController }) {
  const titleId = useId();
  return (
    <div className="zm-box zm-coach-tip" role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <div className="zm-coach-card__head">
        <h2 id={titleId} className="zm-coach-card__title">
          {COACH_COPY.desktopTitle}
        </h2>
        <IconButton icon="close" label={COACH_COPY.close} onClick={() => coach.close("skip")} />
      </div>
      <ul className="zm-coach-tip__list">
        {COACH_DESKTOP_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <CoachSupport />
      <Button id={coach.primaryId} variant="primary" icon="check" onClick={() => coach.close("finish")}>
        {COACH_COPY.gotIt}
      </Button>
    </div>
  );
}

function HelpButton({ id, onClick, expanded }: { id: string; onClick: () => void; expanded: boolean }) {
  return (
    <Button
      id={id}
      variant="secondary"
      className="zm-btn--icon zm-coach-help"
      aria-label={COACH_COPY.help}
      title={COACH_COPY.help}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span aria-hidden="true">?</span>
    </Button>
  );
}

export interface CoachMarksProps {
  /** Auto-open on the first visit; the `?` button works either way. */
  autoOpen: boolean;
  reducedMotion?: boolean;
}

export function CoachMarks({ autoOpen, reducedMotion }: CoachMarksProps) {
  const coach = useCoachmarks(autoOpen);
  const motionReduced = useReducedMotionPreference(reducedMotion);
  const step = currentStep(coach.state);
  const box = useCoachTarget(step?.target ?? null);
  const { open, variant } = coach.state;
  return (
    <>
      <HelpButton id={coach.helpId} onClick={coach.open} expanded={open} />
      {open && variant === "mobile" ? <CoachSpotlight box={box} /> : null}
      {open && variant === "mobile" ? <CoachCard coach={coach} reducedMotion={motionReduced} /> : null}
      {open && variant === "desktop" ? <CoachTip coach={coach} /> : null}
      <p className="zm-sr-only" role="status" aria-live="polite">
        {coachAnnouncement(coach.state)}
      </p>
    </>
  );
}

export default CoachMarks;
