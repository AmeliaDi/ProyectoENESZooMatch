"use client";

/**
 * One conversation inside `/chats`: header (sprite, alias, track, stage), the
 * first-time guide, the rounds, the question of the turn (cards), the free
 * chat invitation, the free chat, and the safety menu always one tap away.
 */
import type { ConversationDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";
import { Chip } from "@/ui/kit/surfaces";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";

import { CHAT_COPY, CONVERSATION_COPY, stageLabel, trackLabel } from "./chat-copy";
import { ChatGuide } from "./chat-guide";
import { FreeChat } from "./free-chat";
import { FreeInvite } from "./free-invite";
import { PeerSprite } from "./peer-sprite";
import { QuestionCards } from "./question-cards";
import { RoundsView } from "./rounds-view";
import { SafetyMenu } from "./safety-menu";
import { useConversation, type ConversationActions, type PendingMessage } from "./use-conversation";

const SPRITE_SIZE = 48;

function Header({ convo }: { convo: ConversationDto }) {
  return (
    <header className="zm-convo__head">
      <PeerSprite peer={convo.peer} size={SPRITE_SIZE} />
      <div className="zm-convo__who">
        <h2 className="zm-chat__title">{convo.peer.alias}</h2>
        <p className="zm-convo__meta">
          <Chip tone={convo.track} icon={convo.track}>{trackLabel(convo.track)}</Chip>
          <span className="zm-num">{stageLabel(convo.stage, convo.completedRounds)}</span>
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
      <FreeInvite convo={convo} onChoose={actions.free} />
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
