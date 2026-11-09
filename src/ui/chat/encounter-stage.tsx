"use client";

/**
 * Game Boy Pokémon-style encounter stage for `/chats`:
 * - Top-right platform: your match's animalito + top-left HUD (name, level, track, bond bar)
 * - Bottom-left platform: your animalito + bottom-right HUD (name, stage, unlocked gifts)
 * - Synthesized 8-bit animal cries and typewriter speech blips ("soniditos")
 * - 4-button handheld command bar: HABLAR · MOCHILA · REGISTRO · SONIDO
 * - Toggleable Mochila (progressive gift inventory unlocked by interaction)
 *   and Registro de conversación (chronological battle/chat log).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ConversationDto } from "@/contracts/chat";
import { formatIdentity } from "@/domain/identity/format-identity";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { Chip } from "@/ui/kit/surfaces";

import { playAnimalCry, playGiftFanfare, playSpeechBlip, voiceProfileFor } from "./animal-voice";
import { ArenaThemeBackdrop, ArenaThemeBar, useArenaTheme } from "./arena-theme";
import { CONVERSATION_COPY, roundsStage, stageLabel, trackLabel } from "./chat-copy";
import {
  MOCHILA_ITEMS,
  buildEncounterScript,
  computeEncounterProgress,
  formatGiftMessage,
  giftIconPaths,
  resolveMySprite,
  type DialogueLine,
  type GiftItemId,
  type LocalGiftEntry,
  type MochilaItem,
} from "./chat-mochila";
import type { ConversationActions } from "./use-conversation";

const STAGE_SPRITE_SIZE = 60;
const TYPEWRITER_MS = 45;
const POST_SPEECH_STEPS = 38;
const MIN_SPEAKING_STEPS = 64;
const LOCAL_GIFTS_PREFIX = "zm-chat-gifts:";

function readLocalGifts(convoId: string): LocalGiftEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${LOCAL_GIFTS_PREFIX}${convoId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LocalGiftEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as LocalGiftEntry).id === "string" &&
        typeof (item as LocalGiftEntry).itemId === "string" &&
        typeof (item as LocalGiftEntry).at === "string",
    );
  } catch {
    return [];
  }
}

function writeLocalGifts(convoId: string, entries: readonly LocalGiftEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${LOCAL_GIFTS_PREFIX}${convoId}`, JSON.stringify(entries));
  } catch {
    // Storage quota or private mode: keep working in memory.
  }
}

export function GiftIcon({ id, size = 24 }: { id: GiftItemId; size?: number }) {
  const paths = giftIconPaths(id);
  return (
    <svg
      className="zm-gift-icon"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      {paths.fill ? <path d={paths.fill} fill="var(--zm-gold)" opacity={0.85} /> : null}
      <path d={paths.line} fill="currentColor" />
    </svg>
  );
}

type ActivePanel = "none" | "mochila" | "registro";
type LogFilter = "all" | "rounds" | "messages" | "gifts";

export interface EncounterStageProps {
  convo: ConversationDto;
  actions: ConversationActions;
  onFocusComposer(): void;
}

export function EncounterStage({ convo, actions, onFocusComposer }: EncounterStageProps) {
  const [arenaTheme, setArenaTheme] = useArenaTheme();
  const [localGifts, setLocalGifts] = useState<LocalGiftEntry[]>(() => readLocalGifts(convo.id));
  const [panel, setPanel] = useState<ActivePanel>("none");
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [selection, setSelection] = useState<{ lastId: string | null; lineId: string | null }>({
    lastId: null,
    lineId: null,
  });
  const [typedState, setTypedState] = useState<{ key: string; chars: number }>({ key: "", chars: 0 });
  const [replayTick, setReplayTick] = useState<number>(0);
  const [peerHop, setPeerHop] = useState(false);
  const [meHop, setMeHop] = useState(false);
  const [flyingGift, setFlyingGift] = useState<{ item: MochilaItem; from: "me" | "peer" } | null>(null);
  const [giftNotice, setGiftNotice] = useState<string | null>(null);
  const forceVoiceRef = useRef(false);

  const peerName = formatIdentity(convo.peer.identity);
  const peerAnimalId = convo.peer.identity.animalId ?? "nutria";
  const peerColorId = convo.peer.identity.colorId ?? "ennea-2";
  const mySprite = useMemo(() => resolveMySprite(convo), [convo]);

  const peerVoice = useMemo(() => voiceProfileFor(peerAnimalId, peerColorId), [peerAnimalId, peerColorId]);
  const myVoice = useMemo(() => voiceProfileFor(mySprite.animalId, mySprite.colorId), [mySprite.animalId, mySprite.colorId]);

  const progress = useMemo(
    () => computeEncounterProgress(convo, localGifts.length),
    [convo, localGifts.length],
  );
  const script = useMemo(
    () => buildEncounterScript(convo, localGifts),
    [convo, localGifts],
  );

  // Follow the latest line automatically unless the user selected an earlier line on the current script state.
  const lastScriptId = script.at(-1)?.id ?? null;
  const selectedLineId = selection.lastId === lastScriptId ? selection.lineId : lastScriptId;

  const activeIndex = useMemo(() => {
    if (!selectedLineId) return Math.max(0, script.length - 1);
    const found = script.findIndex((line) => line.id === selectedLineId);
    return found >= 0 ? found : Math.max(0, script.length - 1);
  }, [script, selectedLineId]);

  const activeLine: DialogueLine = script[activeIndex] ?? script[0]!;
  const fullText = activeLine.text;
  const lineKey = `${activeLine.id}:${replayTick}`;
  const animTick = typedState.key === lineKey ? typedState.chars : 0;
  const totalChars = fullText.length;
  const totalAnimSteps = Math.max(MIN_SPEAKING_STEPS, totalChars + POST_SPEECH_STEPS);
  const typedChars = Math.min(totalChars, animTick);

  // Typewriter effect + extended speaking animation & synthesized 8-bit speech blips.
  useEffect(() => {
    if (totalChars === 0) return;

    const force = forceVoiceRef.current;
    forceVoiceRef.current = false;

    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setTypedState({ key: lineKey, chars: step });
      const whileTyping = step <= totalChars && step % 2 === 1;
      const duringTail = step > totalChars && step < totalAnimSteps && step % 7 === 0;
      if (whileTyping || duringTail) {
        if (activeLine.speaker === "peer") {
          playSpeechBlip(peerAnimalId, peerColorId, step, { muted: convo.muted, force });
        } else if (activeLine.speaker === "me") {
          playSpeechBlip(mySprite.animalId, mySprite.colorId, step, { muted: convo.muted, force });
        }
      }
      if (step >= totalAnimSteps) {
        window.clearInterval(timer);
      }
    }, TYPEWRITER_MS);

    return () => window.clearInterval(timer);
  }, [lineKey, activeLine.speaker, totalChars, totalAnimSteps, peerAnimalId, peerColorId, mySprite.animalId, mySprite.colorId, convo.muted]);

  const isTyping = typedChars < totalChars;
  const isSpeakingAnim = animTick < totalAnimSteps;
  const peerSpeaking = (activeLine.speaker === "peer" && isSpeakingAnim) || peerHop;
  const meSpeaking = (activeLine.speaker === "me" && isSpeakingAnim) || meHop;

  const triggerPeerCry = useCallback(() => {
    setPeerHop(true);
    playAnimalCry(peerAnimalId, peerColorId, { muted: convo.muted, force: true });
    window.setTimeout(() => {
      playAnimalCry(peerAnimalId, peerColorId, { muted: convo.muted, force: true });
    }, 520);
    window.setTimeout(() => setPeerHop(false), 1650);
  }, [peerAnimalId, peerColorId, convo.muted]);

  const triggerMeCry = useCallback(() => {
    setMeHop(true);
    playAnimalCry(mySprite.animalId, mySprite.colorId, { muted: convo.muted, force: true });
    window.setTimeout(() => {
      playAnimalCry(mySprite.animalId, mySprite.colorId, { muted: convo.muted, force: true });
    }, 520);
    window.setTimeout(() => setMeHop(false), 1650);
  }, [mySprite.animalId, mySprite.colorId, convo.muted]);

  const triggerDueto = useCallback(() => {
    triggerMeCry();
    window.setTimeout(() => triggerPeerCry(), 460);
  }, [triggerMeCry, triggerPeerCry]);

  const handleReplayLine = useCallback((lineId?: string) => {
    forceVoiceRef.current = true;
    if (lineId) setSelection({ lastId: lastScriptId, lineId });
    setReplayTick((n) => n + 1);
  }, [lastScriptId]);

  const handleSendGift = useCallback(
    async (item: MochilaItem) => {
      playGiftFanfare({ muted: convo.muted, force: true });
      setFlyingGift({ item, from: "me" });
      setMeHop(true);
      window.setTimeout(() => {
        setMeHop(false);
        setPeerHop(true);
        playAnimalCry(peerAnimalId, peerColorId, { muted: convo.muted, force: true });
      }, 360);
      window.setTimeout(() => {
        setPeerHop(false);
        setFlyingGift(null);
      }, 950);

      if (convo.stage === "free") {
        const err = await actions.send(formatGiftMessage(item));
        if (err) {
          setGiftNotice(err);
          return;
        }
        setGiftNotice(`Enviaste ${item.name} al encuentro.`);
        setPanel("none");
        return;
      }

      const entry: LocalGiftEntry = {
        id: `${Date.now()}-${item.id}`,
        itemId: item.id,
        at: new Date().toISOString(),
      };
      const next = [...localGifts, entry];
      setLocalGifts(next);
      writeLocalGifts(convo.id, next);
      const giftLineId = `local-gift-${entry.id}`;
      setSelection({ lastId: giftLineId, lineId: giftLineId });
      setGiftNotice(`Lanzaste ${item.name} a ${peerName.shortName}.`);
      setPanel("none");
    },
    [convo.stage, convo.muted, convo.id, actions, localGifts, peerAnimalId, peerColorId, peerName.shortName],
  );

  const currentQuestion = Math.min(
    convo.minRoundsForFree,
    Math.max(1, convo.rounds.length || convo.completedRounds + 1),
  );
  const progressText =
    convo.stage === "rounds"
      ? roundsStage(currentQuestion, convo.minRoundsForFree)
      : stageLabel(convo.stage, convo.completedRounds);

  const filteredLog = useMemo(() => {
    if (logFilter === "all") return script;
    if (logFilter === "rounds") {
      return script.filter((l) => l.kind === "round_question" || l.kind === "round_mine" || l.kind === "round_theirs");
    }
    if (logFilter === "messages") return script.filter((l) => l.kind === "message");
    return script.filter((l) => l.kind === "gift");
  }, [script, logFilter]);

  return (
    <section
      className="zm-arena"
      aria-label={CONVERSATION_COPY.arenaLabel}
      data-track={convo.track}
      data-arena-theme={arenaTheme}
    >
      {/* ─── Carcasa de Consola Portátil Game Boy (Encuentro de animalitos) ─── */}
      <div className="zm-box zm-box--frame zm-arena__screen">
        {/* Bisel superior de la consola portátil + Selector de Tema */}
        <div className="zm-arena__bezel-top">
          <span className="zm-arena__power">
            <span
              className="zm-arena__led"
              data-speaking={peerSpeaking || meSpeaking || undefined}
              aria-hidden="true"
            />
            <span>CONSOLA DE ENCUENTRO</span>
          </span>
          <span className="zm-arena__cartridge zm-num">{progressText}</span>
        </div>

        <ArenaThemeBar theme={arenaTheme} onChange={setArenaTheme} />

        {/* Pantalla LCD del escenario con plataformas enfrentadas */}
        <div className="zm-box zm-arena__lcd">
          <ArenaThemeBackdrop theme={arenaTheme} />
          {/* Fila superior: HUD de tu match (izquierda) + Plataforma de su animalito (derecha) */}
          <div className="zm-arena__row zm-arena__row--top">
            <div className="zm-box zm-arena__hud zm-arena__hud--peer">
              <div className="zm-arena__hud-top">
                <h2 className="zm-arena__name">{peerName.title}</h2>
                <span className="zm-arena__lvl zm-num">NV {progress.level}</span>
              </div>
              <div className="zm-arena__meta">
                <Chip tone={convo.track} icon={convo.track}>{trackLabel(convo.track)}</Chip>
                <span className="zm-num">{progressText}</span>
              </div>
              <div className="zm-arena__bar-wrap" aria-label={`Vínculo ${progress.bondPercent} por ciento`}>
                <span className="zm-arena__bar-tag">VÍNCULO</span>
                <div className="zm-arena__bar-track">
                  <div className="zm-arena__bar-fill" style={{ width: `${progress.bondPercent}%` }} />
                </div>
                <span className="zm-arena__bar-num zm-num">{progress.bondPercent}%</span>
              </div>
            </div>

            <div className="zm-arena__spot zm-arena__spot--peer">
              {peerSpeaking ? (
                <span className="zm-box zm-arena__cry" aria-hidden="true">
                  {peerVoice.cryLabel}
                </span>
              ) : null}
              <button
                type="button"
                className="zm-arena__actor zm-arena__actor--peer"
                data-speaking={peerSpeaking || undefined}
                data-hop={peerHop || undefined}
                onClick={triggerPeerCry}
                aria-label={`Escuchar a ${peerName.shortName}`}
                title={`Toca para escuchar a ${peerName.shortName}`}
              >
                <PixelAnimal
                  animalId={peerAnimalId}
                  colorId={peerColorId}
                  mark={convo.peer.identity.mark}
                  size={STAGE_SPRITE_SIZE}
                  animated
                  happy={peerSpeaking || flyingGift !== null}
                  romance={convo.track === "romance" && (peerSpeaking || flyingGift !== null)}
                />
              </button>
              <div className="zm-arena__pad zm-arena__pad--peer" aria-hidden="true" />
            </div>
          </div>

          {/* Regalo volando en arco cuando alguien regala un objeto de la mochila */}
          {flyingGift ? (
            <div className="zm-arena__fly" data-from={flyingGift.from} aria-hidden="true">
              <span className="zm-box zm-arena__fly-box">
                <GiftIcon id={flyingGift.item.id} size={20} />
                <span>{flyingGift.item.name}</span>
              </span>
            </div>
          ) : null}

          {/* Fila inferior: Plataforma de tu animalito (izquierda) + Tu HUD (derecha) */}
          <div className="zm-arena__row zm-arena__row--bottom zm-arena__row--me">
            <div className="zm-arena__spot zm-arena__spot--me">
              {meSpeaking ? (
                <span className="zm-box zm-arena__cry zm-arena__cry--me" aria-hidden="true">
                  {myVoice.cryLabel}
                </span>
              ) : null}
              <button
                type="button"
                className="zm-arena__actor zm-arena__actor--me"
                data-speaking={meSpeaking || undefined}
                data-hop={meHop || undefined}
                onClick={triggerMeCry}
                aria-label={`Escuchar a tu animalito (${mySprite.shortName})`}
                title="Toca para escuchar a tu animalito"
              >
                <PixelAnimal
                  animalId={mySprite.animalId}
                  colorId={mySprite.colorId}
                  mark={mySprite.mark}
                  size={STAGE_SPRITE_SIZE}
                  animated
                  happy={meSpeaking || flyingGift !== null}
                  romance={convo.track === "romance" && meSpeaking}
                />
              </button>
              <div className="zm-arena__pad zm-arena__pad--me" aria-hidden="true" />
            </div>

            <div className="zm-box zm-arena__hud zm-arena__hud--me">
              <div className="zm-arena__hud-top">
                <span className="zm-arena__name">Tú · {mySprite.shortName}</span>
                <span className="zm-arena__lvl zm-num">PTS {progress.points}</span>
              </div>
              <p className="zm-arena__sub">
                Mochila: <strong className="zm-num">{progress.unlockedItems.length}/{MOCHILA_ITEMS.length}</strong> regalos desbloqueados
              </p>
              {progress.nextItem ? (
                <p className="zm-arena__unlock-hint">
                  Siguiente: <strong>{progress.nextItem.name}</strong> (+{progress.pointsToNext} pts)
                </p>
              ) : (
                <p className="zm-arena__unlock-hint">¡Todos los regalos desbloqueados!</p>
              )}
            </div>
          </div>
        </div>

        {/* ─── Consola inferior: Diálogo RPG + Menú de 4 comandos Game Boy ─── */}
        <div className="zm-arena__console">
          <div className="zm-box zm-box--frame zm-arena__dialog" role="region" aria-label="Diálogo del encuentro">
            <div className="zm-arena__dialog-head">
              <span className="zm-arena__speaker" data-speaker={activeLine.speaker}>
                [{activeLine.badge}] {activeLine.speakerName}
              </span>
              <span className="zm-arena__step zm-num">
                {activeIndex + 1}/{script.length}
              </span>
            </div>

            <div
              className="zm-arena__dialog-body"
              onClick={() => {
                if (isTyping) setTypedState({ key: lineKey, chars: totalChars });
                else handleReplayLine();
              }}
            >
              {activeLine.gift ? (
                <span className="zm-box zm-arena__gift-chip">
                  <GiftIcon id={activeLine.gift.id} size={20} />
                  <span>{activeLine.gift.name}</span>
                </span>
              ) : null}
              <p className="zm-arena__dialog-text">
                {fullText.slice(0, typedChars)}
                <span className="zm-arena__cursor" aria-hidden="true">
                  {isTyping ? "▌" : "▼"}
                </span>
              </p>
            </div>

            <div className="zm-arena__dialog-foot">
              <div className="zm-arena__nav">
                <Button
                  variant="ghost"
                  disabled={activeIndex <= 0}
                  onClick={() => {
                    const prev = script[activeIndex - 1];
                    if (prev) handleReplayLine(prev.id);
                  }}
                >
                  ◂ Ant
                </Button>
                <Button
                  variant="ghost"
                  disabled={activeIndex >= script.length - 1}
                  onClick={() => {
                    const next = script[activeIndex + 1];
                    if (next) handleReplayLine(next.id);
                  }}
                >
                  Sig ▸
                </Button>
              </div>
              <Button variant="ghost" icon="sound-on" onClick={() => handleReplayLine()}>
                Voz
              </Button>
            </div>
          </div>

          {/* ─── Menú de 4 comandos estilo Game Boy (HABLAR / MOCHILA / REGISTRO / SONIDITOS) ─── */}
          <div className="zm-box zm-arena__menu" role="toolbar" aria-label="Comandos del encuentro">
            <button
              type="button"
              className="zm-box zm-arena__cmd"
              data-active={panel === "none" || undefined}
              onClick={() => {
                setPanel("none");
                onFocusComposer();
              }}
            >
              <span className="zm-arena__cmd-arrow" aria-hidden="true">▸</span>
              <Icon name="chat" />
              <span>HABLAR</span>
            </button>

            <button
              type="button"
              className="zm-box zm-arena__cmd"
              aria-expanded={panel === "mochila"}
              data-active={panel === "mochila" || undefined}
              onClick={() => setPanel((p) => (p === "mochila" ? "none" : "mochila"))}
            >
              <span className="zm-arena__cmd-arrow" aria-hidden="true">▸</span>
              <Icon name="romance" />
              <span>MOCHILA ({progress.unlockedItems.length}/{MOCHILA_ITEMS.length})</span>
            </button>

            <button
              type="button"
              className="zm-box zm-arena__cmd"
              aria-expanded={panel === "registro"}
              data-active={panel === "registro" || undefined}
              onClick={() => setPanel((p) => (p === "registro" ? "none" : "registro"))}
            >
              <span className="zm-arena__cmd-arrow" aria-hidden="true">▸</span>
              <Icon name="list" />
              <span>REGISTRO ({script.length})</span>
            </button>

            <button
              type="button"
              className="zm-box zm-arena__cmd"
              onClick={triggerDueto}
            >
              <span className="zm-arena__cmd-arrow" aria-hidden="true">▸</span>
              <Icon name="sound-on" />
              <span>SONIDITOS</span>
            </button>
          </div>
        </div>
      </div>

      {giftNotice ? (
        <p className="zm-box zm-chat__notice" role="status">
          {giftNotice}
        </p>
      ) : null}

      {/* ─── Panel desplegable: MOCHILA DE REGALOS ─── */}
      {panel === "mochila" ? (
        <section className="zm-box zm-box--frame zm-mochila" aria-labelledby="mochila-heading">
          <div className="zm-mochila__head">
            <div>
              <h3 id="mochila-heading" className="zm-chat__title">
                {CONVERSATION_COPY.mochilaTitle}
              </h3>
              <p className="zm-detail__muted">{CONVERSATION_COPY.mochilaSubtitle}</p>
            </div>
            <Button variant="ghost" icon="close" onClick={() => setPanel("none")}>
              Cerrar
            </Button>
          </div>

          <div className="zm-box zm-mochila__progress">
            <span className="zm-num">
              Puntos de interacción: <strong>{progress.points}</strong>
            </span>
            {progress.nextItem ? (
              <span className="zm-detail__muted">
                Responde o chatea <strong>{progress.pointsToNext}</strong> {progress.pointsToNext === 1 ? "vez" : "veces"} más para ganar{" "}
                <strong>{progress.nextItem.name}</strong>.
              </span>
            ) : (
              <span className="zm-detail__muted">¡Desbloqueaste toda la colección de regalos de este encuentro!</span>
            )}
          </div>

          <ul className="zm-mochila__grid">
            {MOCHILA_ITEMS.map((item) => {
              const unlocked = progress.points >= item.minPoints;
              const missing = Math.max(0, item.minPoints - progress.points);
              return (
                <li
                  key={item.id}
                  className="zm-box zm-mochila__card"
                  data-unlocked={unlocked || undefined}
                >
                  <div className="zm-mochila__icon">
                    <GiftIcon id={item.id} size={28} />
                  </div>
                  <div className="zm-mochila__info">
                    <div className="zm-mochila__title-row">
                      <strong className="zm-mochila__name">{item.name}</strong>
                      <span className="zm-mochila__tag">{item.category}</span>
                    </div>
                    <p className="zm-mochila__desc">{item.description}</p>
                    {unlocked ? (
                      <Button
                        variant="secondary"
                        onClick={() => void handleSendGift(item)}
                      >
                        {convo.stage === "free" ? "Regalar en el chat" : "Lanzar regalo"}
                      </Button>
                    ) : (
                      <p className="zm-mochila__locked zm-num">
                        Se desbloquea con +{missing} {missing === 1 ? "interacción" : "interacciones"} (meta: {item.minPoints} pts)
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ─── Panel desplegable: REGISTRO DE CONVERSACIÓN ─── */}
      {panel === "registro" ? (
        <section className="zm-box zm-box--frame zm-registro" aria-labelledby="registro-heading">
          <div className="zm-mochila__head">
            <div>
              <h3 id="registro-heading" className="zm-chat__title">
                {CONVERSATION_COPY.registroTitle}
              </h3>
              <p className="zm-detail__muted">{CONVERSATION_COPY.registroSubtitle}</p>
            </div>
            <Button variant="ghost" icon="close" onClick={() => setPanel("none")}>
              Cerrar
            </Button>
          </div>

          <div className="zm-registro__filters" role="group" aria-label="Filtrar registro">
            <Button
              variant={logFilter === "all" ? "secondary" : "ghost"}
              onClick={() => setLogFilter("all")}
            >
              Todo ({script.length})
            </Button>
            <Button
              variant={logFilter === "rounds" ? "secondary" : "ghost"}
              onClick={() => setLogFilter("rounds")}
            >
              Rondas
            </Button>
            <Button
              variant={logFilter === "messages" ? "secondary" : "ghost"}
              onClick={() => setLogFilter("messages")}
            >
              Mensajes ({convo.messages.length})
            </Button>
            <Button
              variant={logFilter === "gifts" ? "secondary" : "ghost"}
              onClick={() => setLogFilter("gifts")}
            >
              Regalos
            </Button>
          </div>

          {convo.hasOlder ? (
            <Button variant="ghost" onClick={() => void actions.older()}>
              {CONVERSATION_COPY.olderMessages}
            </Button>
          ) : null}

          <ol className="zm-registro__list">
            {filteredLog.map((entry) => (
              <li
                key={entry.id}
                className="zm-box zm-registro__item"
                data-speaker={entry.speaker}
                data-active={entry.id === activeLine.id || undefined}
              >
                <div className="zm-registro__meta">
                  <span className="zm-registro__who">
                    [{entry.badge}] {entry.speakerName}
                  </span>
                  <Button
                    variant="ghost"
                    icon="sound-on"
                    onClick={() => handleReplayLine(entry.id)}
                  >
                    Escuchar en arena
                  </Button>
                </div>
                <div className="zm-registro__body">
                  {entry.gift ? <GiftIcon id={entry.gift.id} size={20} /> : null}
                  <p className="zm-registro__text">{entry.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
