"use client";

/**
 * Safety menu, always one tap away (docs/CHAT.md §12.5): mute, pause, delete
 * my messages, block, report and close. Every destructive step asks once,
 * without guilt; nothing tells the other person why.
 */
import { useState } from "react";

import { REPORT_REASONS, type ConversationDto, type ReportReason } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";
import { Dialog } from "@/ui/kit/dialog";

import { REPORT_REASON_LABELS } from "./conversation-copy";
import { SAFETY_COPY } from "./chat-copy";
import type { ConversationActions } from "./use-conversation";

type Confirm = "deleteMine" | "block" | "report" | "close" | null;

const BODY: Record<Exclude<Confirm, null>, string> = {
  deleteMine: SAFETY_COPY.deleteMineBody,
  block: SAFETY_COPY.blockBody,
  report: SAFETY_COPY.reportBody,
  close: SAFETY_COPY.closeBody,
};
const TITLE: Record<Exclude<Confirm, null>, string> = {
  deleteMine: SAFETY_COPY.deleteMine,
  block: SAFETY_COPY.block,
  report: SAFETY_COPY.report,
  close: SAFETY_COPY.close,
};

function ReasonPicker({ value, onChange }: { value: ReportReason; onChange(reason: ReportReason): void }) {
  return (
    <fieldset className="zm-safety__reasons">
      <legend className="zm-field__label">{SAFETY_COPY.reportReason}</legend>
      {REPORT_REASONS.map((reason) => (
        <label key={reason} className="zm-safety__reason">
          <input type="radio" name="report-reason" value={reason} checked={value === reason} onChange={() => onChange(reason)} />
          {REPORT_REASON_LABELS[reason]}
        </label>
      ))}
    </fieldset>
  );
}

export interface SafetyMenuProps {
  convo: ConversationDto;
  actions: ConversationActions;
  onGone(): void;
}

export function SafetyMenu({ convo, actions, onGone }: SafetyMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reason, setReason] = useState<ReportReason>("acoso");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(task: () => Promise<string | null>, leaves: boolean) {
    setBusy(true);
    const failure = await task();
    setBusy(false);
    setMessage(failure ?? SAFETY_COPY.done);
    setConfirm(null);
    if (failure === null && leaves) {
      setOpen(false);
      onGone();
    }
  }

  const confirmed: Record<Exclude<Confirm, null>, () => void> = {
    deleteMine: () => void run(actions.deleteMine, false),
    block: () => void run(() => actions.exit("block"), true),
    report: () => void run(() => actions.report(reason), true),
    close: () => void run(() => actions.exit("leave"), true),
  };

  return (
    <>
      <Button variant="secondary" icon="list" onClick={() => { setMessage(null); setOpen(true); }}>
        <span className="zm-btn__label">{SAFETY_COPY.menu}</span>
      </Button>
      <Dialog open={open} onClose={() => { setOpen(false); setConfirm(null); }} title={confirm ? TITLE[confirm] : SAFETY_COPY.menu} kind="sheet">
        {confirm ? (
          <div className="zm-chat__form">
            <p className="zm-chat__step">{BODY[confirm]}</p>
            {confirm === "report" ? <ReasonPicker value={reason} onChange={setReason} /> : null}
            <div className="zm-chat__actions">
              <Button variant="secondary" autoFocus onClick={() => setConfirm(null)}>{SAFETY_COPY.cancel}</Button>
              <Button variant="danger" busy={busy} disabled={busy} onClick={confirmed[confirm]}>{SAFETY_COPY.confirm}</Button>
            </div>
          </div>
        ) : (
          <ul className="zm-safety">
            <li><Button variant="ghost" icon="notification" onClick={() => void run(() => actions.mute(!convo.muted), false)}>{convo.muted ? SAFETY_COPY.unmute : SAFETY_COPY.mute}</Button></li>
            {convo.stage !== "paused" || convo.pausedByMe ? (
              <li><Button variant="ghost" icon="pause" onClick={() => void run(() => actions.pause(convo.stage !== "paused"), false)}>{convo.stage === "paused" ? SAFETY_COPY.resume : SAFETY_COPY.pause}</Button></li>
            ) : null}
            <li><Button variant="ghost" icon="delete" onClick={() => setConfirm("deleteMine")}>{SAFETY_COPY.deleteMine}</Button></li>
            <li><Button variant="ghost" icon="close" onClick={() => setConfirm("block")}>{SAFETY_COPY.block}</Button></li>
            <li><Button variant="ghost" icon="alert" onClick={() => setConfirm("report")}>{SAFETY_COPY.report}</Button></li>
            <li><Button variant="ghost" icon="logout" onClick={() => setConfirm("close")}>{SAFETY_COPY.close}</Button></li>
          </ul>
        )}
        <p className="zm-chat__message" role="status" aria-live="polite">{message}</p>
      </Dialog>
    </>
  );
}
