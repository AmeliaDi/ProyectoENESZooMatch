"use client";

/**
 * Question rounds as atlas "frame cards": the question, your answer (or the
 * composer / "Pasar"), and theirs only once revealed. A revealed answer can
 * get a quick emoji reaction; a kind optional "¿te gustó?" closes the round.
 */
import type { ConversationDto, RoundDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { CONVERSATION_COPY, roundsStage } from "./chat-copy";
import { emojiName } from "./emoji-search";
import { TextComposer } from "./text-composer";
import type { ConversationActions } from "./use-conversation";

const ANSWER_ROWS = 3;

function Reactions({ round, reactions, onReact }: { round: RoundDto; reactions: readonly string[]; onReact(emoji: string | null): void }) {
  return (
    <div className="zm-round__reactions" role="group" aria-label={CONVERSATION_COPY.reactLabel}>
      {reactions.map((emoji) => {
        const on = round.myReaction === emoji;
        return (
          <button key={emoji} type="button" className="zm-box zm-round__react" aria-pressed={on} aria-label={emojiName(emoji) ?? emoji} onClick={() => onReact(on ? null : emoji)}>
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

function Feedback({ onAnswer }: { onAnswer(liked: boolean): void }) {
  return (
    <div className="zm-round__feedback">
      <p className="zm-round__who">{CONVERSATION_COPY.feedbackQuestion}</p>
      <Button variant="ghost" onClick={() => onAnswer(true)}>{CONVERSATION_COPY.feedbackYes}</Button>
      <Button variant="ghost" onClick={() => onAnswer(false)}>{CONVERSATION_COPY.feedbackNo}</Button>
    </div>
  );
}

function Mine({ round, open, limit, actions }: { round: RoundDto; open: boolean; limit: number; actions: ConversationActions }) {
  if (round.minePassed) return <p className="zm-round__pending">{CONVERSATION_COPY.youPassed}</p>;
  if (round.mine !== null) return <p className="zm-round__text">{round.mine}</p>;
  if (!open) return null;
  return (
    <>
      <TextComposer label={CONVERSATION_COPY.answerLabel} submitLabel={CONVERSATION_COPY.answerSend} limit={limit} rows={ANSWER_ROWS} onSubmit={(body) => actions.answer(round.index, body)} />
      <Button variant="ghost" onClick={() => void actions.pass(round.index)}>{CONVERSATION_COPY.pass}</Button>
    </>
  );
}

function Theirs({ round, convo, actions }: { round: RoundDto; convo: ConversationDto; actions: ConversationActions }) {
  if (!round.revealed) {
    return (
      <>
        <p className="zm-round__pending"><Icon name="pause" /> {CONVERSATION_COPY.theirPending}</p>
        {round.mine !== null || round.minePassed ? <p className="zm-detail__muted">{CONVERSATION_COPY.revealsLater}</p> : null}
      </>
    );
  }
  if (round.theirsPassed || round.theirs === null) return <p className="zm-round__pending">{CONVERSATION_COPY.passed}</p>;
  return (
    <>
      <p className="zm-round__text">
        {round.theirs}
        {round.theirReaction ? <span className="zm-round__their-react" aria-label={emojiName(round.theirReaction) ?? ""}> {round.theirReaction}</span> : null}
      </p>
      <Reactions round={round} reactions={convo.reactions} onReact={(emoji) => void actions.react(round.index, emoji)} />
    </>
  );
}

function RoundCard({ round, convo, actions, position }: { round: RoundDto; convo: ConversationDto; actions: ConversationActions; position: number }) {
  const headingId = `round-${round.index}`;
  const open = convo.stage !== "paused" && !round.revealed;
  return (
    <li>
      <article className="zm-box zm-box--frame zm-round" aria-labelledby={headingId}>
        <p className="zm-eyebrow zm-num">{roundsStage(position, convo.minRoundsForFree)}</p>
        <h3 id={headingId} className="zm-round__question">{round.question}</h3>
        <div className="zm-round__answer" data-who="mine">
          <p className="zm-round__who">{CONVERSATION_COPY.yourAnswer}</p>
          <Mine round={round} open={open} limit={convo.limits.answerChars} actions={actions} />
        </div>
        <div className="zm-round__answer" data-who="theirs">
          <p className="zm-round__who">{CONVERSATION_COPY.theirAnswer}</p>
          <Theirs round={round} convo={convo} actions={actions} />
        </div>
        {round.revealed && !round.feedbackGiven ? <Feedback onAnswer={(liked) => void actions.feedback(round.index, liked)} /> : null}
      </article>
    </li>
  );
}

export function RoundsView({ convo, actions }: { convo: ConversationDto; actions: ConversationActions }) {
  if (convo.rounds.length === 0) return null;
  return (
    <ol className="zm-rounds" aria-label={CONVERSATION_COPY.stageRounds}>
      {convo.rounds.map((round, i) => <RoundCard key={round.index} round={round} convo={convo} actions={actions} position={i + 1} />)}
    </ol>
  );
}
