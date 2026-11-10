"use client";

/**
 * One conversation inside `/chats`: header (sprite, stored name, track, stage),
 * the first-time guide, the rounds, the question of the turn (cards), the free
 * chat invitation, the free chat, and the safety menu always one tap away.
 */
import { useCallback, useEffect, useRef } from "react";

import type { ConversationDto } from "@/contracts/chat";
import { emitSound } from "@/ui/feedback/feedback";
import { Button } from "@/ui/kit/button";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";

import { CHAT_COPY, CONVERSATION_COPY } from "./chat-copy";
import { ChatGuide } from "./chat-guide";
import { EncounterStage } from "./encounter-stage";
import { FreeChat } from "./free-chat";
import { QuestionCards } from "./question-cards";
import { QuizCoincidencias } from "./quiz-coincidencias";
import { RoundsView } from "./rounds-view";
import { SafetyMenu } from "./safety-menu";
import { useConversation, type ConversationActions, type PendingMessage } from "./use-conversation";

function Turn({ convo, actions }: { convo: ConversationDto; actions: ConversationActions }) {
  if (convo.stage === "paused") {
    return <p className="zm-round__pending">{convo.pausedByMe ? CONVERSATION_COPY.pausedMine : CONVERSATION_COPY.pausedTheirs}</p>;
  }
  if (convo.ask) return <QuestionCards ask={convo.ask} limit={convo.limits.customQuestionChars} onAsk={actions.ask} onOthers={actions.others} />;
  if (convo.stage === "free") return null;
  const open = convo.rounds.some((r) => !r.revealed);
  return open ? null : <p className="zm-detail__muted">{CONVERSATION_COPY.waitingQuestion}</p>;
}

function Body({ convo, conversationId, pending, actions }: { convo: ConversationDto; conversationId: string; pending: readonly PendingMessage[]; actions: ConversationActions }) {
  const free = convo.stage === "free" || (convo.stage === "paused" && convo.messages.length > 0);
  return (
    <>
      <ChatGuide />
      <QuizCoincidencias conversationId={conversationId} />
      {free ? (
        <details className="zm-convo__past">
          <summary>{CONVERSATION_COPY.pastRounds}</summary>
          <RoundsView convo={convo} actions={actions} />
        </details>
      ) : (
        <>
          <p className="zm-detail__muted">{CONVERSATION_COPY.roundsIntro}</p>
          <RoundsView convo={convo} actions={actions} />
        </>
      )}
      <Turn convo={convo} actions={actions} />
      {free ? <FreeChat convo={convo} pending={pending} actions={actions} /> : null}
    </>
  );
}

export interface ConversationViewProps {
  id: string;
  onBack(): void;
  onLock(): void;
  /** The lock closed under us: the gate must ask for the PIN again. */
  onLocked(): void;
}

export function ConversationView({ id, onBack, onLock, onLocked }: ConversationViewProps) {
  const { state, pending, actions } = useConversation(id, onLocked);
  const chimed = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.kind !== "ready" || chimed.current) return;
    chimed.current = true;
    emitSound("chat_abierto");
  }, [state.kind]);

  const focusComposer = useCallback(() => {
    const el = rootRef.current?.querySelector<HTMLElement>("textarea, .zm-cards, .zm-rounds, .zm-free");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLTextAreaElement) el.focus();
  }, []);

  return (
    <div ref={rootRef} className="zm-convo">
      <div className="zm-chat__actions zm-convo__bar">
        <Button variant="ghost" icon="back" onClick={onBack}>
          <span className="zm-btn__label">{CONVERSATION_COPY.back}</span>
        </Button>
        {state.kind === "ready" ? <SafetyMenu convo={state.convo} actions={actions} onGone={onBack} /> : null}
        <Button variant="secondary" icon="privacy" onClick={onLock}>
          <span className="zm-btn__label">{CHAT_COPY.lock}</span>
        </Button>
      </div>
      {state.kind === "loading" ? <LoadingState title={CONVERSATION_COPY.loadingOne} /> : null}
      {state.kind === "gone" ? <EmptyState title={CONVERSATION_COPY.goneTitle} body={CONVERSATION_COPY.goneBody} /> : null}
      {state.kind === "error" ? (
        <ErrorState title={state.message} action={<Button onClick={() => void actions.reload()}>{CONVERSATION_COPY.retry}</Button>} />
      ) : null}
      {state.kind === "ready" ? (
        <>
          <EncounterStage convo={state.convo} actions={actions} onFocusComposer={focusComposer} />
          <Body convo={state.convo} conversationId={id} pending={pending} actions={actions} />
        </>
      ) : null}
    </div>
  );
}
