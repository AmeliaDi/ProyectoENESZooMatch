"use client";

/**
 * Question rounds as a sequence of atlas "frame cards": the question, your
 * answer, and theirs only once both answered. The card of the current round
 * holds the composer until you answer it.
 */
import type { ConversationDto, RoundDto } from "@/contracts/chat";
import { Icon } from "@/ui/kit/icon";

import { CONVERSATION_COPY, roundsStage } from "./chat-copy";
import { TextComposer } from "./text-composer";

const ANSWER_ROWS = 4;

interface RoundCardProps {
  round: RoundDto;
  position: number;
  total: number;
  limit: number;
  onAnswer?: (body: string) => Promise<string | null>;
}

function RoundCard({ round, position, total, limit, onAnswer }: RoundCardProps) {
  const headingId = `round-${round.index}`;
  return (
    <li>
      <article className="zm-box zm-box--frame zm-round" aria-labelledby={headingId}>
        <p className="zm-eyebrow">{roundsStage(position, total)}</p>
        <h3 id={headingId} className="zm-round__question">{round.question}</h3>
        {round.mine !== null ? (
          <div className="zm-round__answer" data-who="mine">
            <p className="zm-round__who">{CONVERSATION_COPY.yourAnswer}</p>
            <p className="zm-round__text">{round.mine}</p>
          </div>
        ) : onAnswer ? (
          <TextComposer label={CONVERSATION_COPY.answerLabel} submitLabel={CONVERSATION_COPY.answerSend} limit={limit} rows={ANSWER_ROWS} onSubmit={onAnswer} />
        ) : null}
        <div className="zm-round__answer" data-who="theirs">
          <p className="zm-round__who">{CONVERSATION_COPY.theirAnswer}</p>
          {round.theirs !== null ? (
            <p className="zm-round__text">{round.theirs}</p>
          ) : (
            <p className="zm-round__pending"><Icon name="pause" /> {CONVERSATION_COPY.theirPending}</p>
          )}
        </div>
      </article>
    </li>
  );
}

export interface RoundsViewProps {
  convo: ConversationDto;
  onAnswer(round: number, body: string): Promise<string | null>;
}

export function RoundsView({ convo, onAnswer }: RoundsViewProps) {
  const total = Math.max(convo.totalRounds, convo.rounds.length);
  return (
    <ol className="zm-rounds" aria-label={CONVERSATION_COPY.stageRounds}>
      {convo.rounds.map((round, i) => (
        <RoundCard
          key={round.index}
          round={round}
          position={i + 1}
          total={total}
          limit={convo.limits.answerChars}
          {...(convo.stage === "rounds" && round.mine === null ? { onAnswer: (body: string) => onAnswer(round.index, body) } : {})}
        />
      ))}
    </ol>
  );
}
