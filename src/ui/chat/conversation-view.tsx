"use client";

/**
 * One conversation inside `/chats`: header (sprite, stored name, track, stage),
 * the first-time guide, the rounds, the question of the turn (cards), the free
 * chat invitation, the free chat, and the safety menu always one tap away.
 */
import type { ConversationDto } from "@/contracts/chat";
import { formatIdentity } from "@/domain/identity/format-identity";
import { Button } from "@/ui/kit/button";
import { Chip } from "@/ui/kit/surfaces";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";

import { CHAT_COPY, CONVERSATION_COPY, roundsStage, stageLabel, trackLabel } from "./chat-copy";
import { ChatGuide } from "./chat-guide";
import { FreeChat } from "./free-chat";
import { PeerSprite } from "./peer-sprite";
import { QuestionCards } from "./question-cards";
import { RoundsView } from "./rounds-view";
import { SafetyMenu } from "./safety-menu";
import { useConversation, type ConversationActions, type PendingMessage } from "./use-conversation";

const SPRITE_SIZE = 48;

function Header({ convo }: { convo: ConversationDto }) {
  const currentQuestion = Math.min(convo.minRoundsForFree, Math.max(1, convo.rounds.length || convo.completedRounds + 1));
  const progressText =
    convo.stage === "rounds"
      ? roundsStage(currentQuestion, convo.minRoundsForFree)
      : stageLabel(convo.stage, convo.completedRounds);
  const name = formatIdentity(convo.peer.identity);
  return (
    <header className="zm-convo__head">
      <PeerSprite identity={convo.peer.identity} size={SPRITE_SIZE} />
      <div className="zm-convo__who">
        <h2 className="zm-chat__title">{name.title}</h2>
        <p className="zm-convo__meta">
          <Chip tone={convo.track} icon={convo.track}>{trackLabel(convo.track)}</Chip>
          <span className="zm-num">{progressText}</span>
        </p>
      </div>
    </header>
  );
}

function Turn({ convo, actions }: { convo: ConversationDto; actions: ConversationActions }) {
  if (convo.stage === "paused") {
    return <p className="zm-round__pending">{convo.pausedByMe ? CONVERSATION_COPY.pausedMine : CONVERSATION_COPY.pausedTheirs}</p>;
  }
  if (convo.ask) return <QuestionCards ask={convo.ask} limit={convo.limits.customQuestionChars} onAsk={actions.ask} onOthers={actions.others} />;
  if (convo.stage === "free") return null;
  const open = convo.rounds.some((r) => !r.revealed);
  return open ? null : <p className="zm-detail__muted">{CONVERSATION_COPY.waitingQuestion}</p>;
}

function Body({ convo, pending, actions }: { convo: ConversationDto; pending: readonly PendingMessage[]; actions: ConversationActions }) {
  const free = convo.stage === "free" || (convo.stage === "paused" && convo.messages.length > 0);
  return (
    <>
      <ChatGuide />
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
  return (
    <div className="zm-convo">
      <div className="zm-chat__actions zm-convo__bar">
        <Button variant="ghost" icon="back" onClick={onBack}>{CONVERSATION_COPY.back}</Button>
        {state.kind === "ready" ? <SafetyMenu convo={state.convo} actions={actions} onGone={onBack} /> : null}
        <Button variant="secondary" icon="privacy" onClick={onLock}>{CHAT_COPY.lock}</Button>
      </div>
      {state.kind === "loading" ? <LoadingState title={CONVERSATION_COPY.loadingOne} /> : null}
      {state.kind === "gone" ? <EmptyState title={CONVERSATION_COPY.goneTitle} body={CONVERSATION_COPY.goneBody} /> : null}
      {state.kind === "error" ? (
        <ErrorState title={state.message} action={<Button onClick={() => void actions.reload()}>{CONVERSATION_COPY.retry}</Button>} />
      ) : null}
      {state.kind === "ready" ? (
        <>
          <Header convo={state.convo} />
          <Body convo={state.convo} pending={pending} actions={actions} />
        </>
      ) : null}
    </div>
  );
}
