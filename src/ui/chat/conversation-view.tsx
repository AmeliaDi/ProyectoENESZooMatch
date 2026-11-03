"use client";

/**
 * One conversation inside `/chats`: header (sprite, alias, track, stage),
 * the stage body, and the two exits (leave, quick lock). Rounds stay visible
 * through the invitation and fold into a disclosure once the chat is free.
 */
import type { ConversationDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";
import { Chip } from "@/ui/kit/surfaces";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";

import { CHAT_COPY, CONVERSATION_COPY, stageLabel, trackLabel } from "./chat-copy";
import { FreeChat } from "./free-chat";
import { FreeInvite } from "./free-invite";
import { LeaveButton } from "./leave-dialog";
import { PeerSprite } from "./peer-sprite";
import { RoundsView } from "./rounds-view";
import { useConversation, type ConversationActions } from "./use-conversation";

const SPRITE_SIZE = 48;

function progressOf(convo: ConversationDto) {
  if (convo.stage !== "rounds" || convo.currentRound === null) return null;
  const position = convo.rounds.findIndex((round) => round.index === convo.currentRound);
  const total = Math.max(convo.totalRounds, convo.rounds.length);
  return position < 0 || total === 0 ? null : { round: position + 1, total };
}

function Header({ convo }: { convo: ConversationDto }) {
  return (
    <header className="zm-convo__head">
      <PeerSprite peer={convo.peer} size={SPRITE_SIZE} />
      <div className="zm-convo__who">
        <h2 className="zm-chat__title">{convo.peer.alias}</h2>
        <p className="zm-convo__meta">
          <Chip tone={convo.track} icon={convo.track}>{trackLabel(convo.track)}</Chip>
          <span>{stageLabel(convo.stage, progressOf(convo))}</span>
        </p>
      </div>
    </header>
  );
}

function StageBody({ convo, actions }: { convo: ConversationDto; actions: ConversationActions }) {
  if (convo.stage === "free") {
    return (
      <>
        <details className="zm-convo__past">
          <summary>{CONVERSATION_COPY.pastRounds}</summary>
          <RoundsView convo={convo} onAnswer={actions.answer} />
        </details>
        <FreeChat convo={convo} onSend={actions.send} />
      </>
    );
  }
  return (
    <>
      <p className="zm-detail__muted">{CONVERSATION_COPY.roundsIntro}</p>
      <RoundsView convo={convo} onAnswer={actions.answer} />
      {convo.stage === "invite" ? <FreeInvite accepted={convo.freeReady.mine} onAccept={actions.accept} /> : null}
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
  const { state, actions } = useConversation(id, onLocked);
  return (
    <div className="zm-convo">
      <div className="zm-chat__actions zm-convo__bar">
        <Button variant="ghost" icon="back" onClick={onBack}>{CONVERSATION_COPY.back}</Button>
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
          <StageBody convo={state.convo} actions={actions} />
          <div className="zm-chat__actions zm-convo__leave">
            <LeaveButton onLeave={actions.leave} onLeft={onBack} />
          </div>
        </>
      ) : null}
    </div>
  );
}
