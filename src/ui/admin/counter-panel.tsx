"use client";

/**
 * The two tallies the base cannot compute: the ligues and the novios that
 * happened, which only the two people involved can confirm. An admin moves
 * them by hand and the number is all that is stored — ADR-036 keeps the
 * console aggregate, so a tally never names anybody.
 *
 * The arithmetic lives in the database: `admin_bump_counter` clamps at zero
 * under a row lock, writes its own `counter_update` audit row and answers with
 * the value it kept and the one it replaced. The panel shows that answer
 * rather than its own addition, so a lost request cannot leave the screen
 * saying a number the base never stored.
 *
 * Gold is a deliberate exception here and nowhere else in the observatory
 * (ADR-027 reserves gold for key figures): this is the only metric the sky
 * cannot derive from itself. It uses the sanctioned primitives — `PixelNumber
 * gold`, whose pair is already measured by the contrast audit — instead of a
 * new colour.
 */
import { useState } from "react";

import type { AdminCounterKey, CounterMove } from "@/contracts/admin";
import { ADMIN_COUNTER_KEYS } from "@/contracts/admin";
import type { AdminCounter } from "@/contracts/admin-metrics";
import { Button } from "@/ui/kit/button";
import { Field } from "@/ui/kit/field";
import { PixelNumber } from "@/ui/kit/pixel-number";
import { Frame } from "@/ui/kit/surfaces";

import { adminApi } from "./admin-api";
import { ADMIN_COPY, COUNTER_CONFIRM_WORD, COUNTER_COPY, correctionValue, stamp } from "./admin-copy";
import { perHundred } from "./metrics-export";

export interface CounterPanelProps {
  counters: readonly AdminCounter[];
  /** Denominator of the density: accounts with an identity fixed, from the funnel. */
  eclosionados: number;
  /** A move landed, so the console re-reads the observatory and the stamp comes back from the base. */
  onChanged(): void;
  onUnauthorized(): void;
}

/** The row the base answered with, or `null` while the tally has never moved. */
function rowFor(counters: readonly AdminCounter[], key: AdminCounterKey): AdminCounter | undefined {
  return counters.find((counter) => counter.key === key);
}

export function CounterPanel({ counters, eclosionados, onChanged, onUnauthorized }: CounterPanelProps) {
  const [busy, setBusy] = useState<AdminCounterKey | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<AdminCounterKey | null>(null);
  const [amount, setAmount] = useState("");
  const [word, setWord] = useState("");

  async function run(move: CounterMove) {
    if (busy !== null) return;
    setBusy(move.key);
    const result = await adminApi.counterMove(move);
    setBusy(null);
    if (!result.ok && result.reason === "unauthorized") return onUnauthorized();
    if (!result.ok) return setNote(result.message ?? ADMIN_COPY.readError);
    setNote(`${COUNTER_COPY[move.key].label}: la base guardó ${result.value.value} (antes ${result.value.antes}).`);
    setCorrecting(null);
    setAmount("");
    setWord("");
    onChanged();
  }

  function openCorrection(key: AdminCounterKey) {
    setCorrecting(key);
    setAmount("");
    setWord("");
  }

  return (
    <div className="zm-counter">
      <p role="status" aria-live="polite" className="zm-detail__muted">
        {note ?? ""}
      </p>
      {ADMIN_COUNTER_KEYS.map((key) => {
        const row = rowFor(counters, key);
        const value = row?.value ?? 0;
        const density = perHundred(value, eclosionados);
        const exact = correcting === key ? correctionValue(amount) : null;
        return (
          <Frame key={key} title={COUNTER_COPY[key].label} coord="oro" className="zm-counter__cell">
            <p className="zm-counter__figure">
              <PixelNumber value={String(value)} size="lg" gold />
            </p>
            <p className="zm-detail__muted">{COUNTER_COPY[key].body}</p>
            <p className="zm-detail__muted">
              {density === null
                ? "Sin cuentas eclosionadas sobre las que medir la densidad."
                : <>Densidad <span className="zm-num">{density.toFixed(1)}</span> por cada 100 cuentas eclosionadas.</>}
            </p>
            <div className="zm-admin__actions">
              <Button variant="secondary" busy={busy === key} disabled={busy !== null} onClick={() => void run({ key, delta: 1 })}>
                +1
              </Button>
              <Button variant="secondary" busy={busy === key} disabled={busy !== null} onClick={() => void run({ key, delta: -1 })}>
                −1
              </Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => openCorrection(key)}>
                Corregir
              </Button>
            </div>
            {correcting === key ? (
              <div className="zm-box zm-admin__confirm">
                <p>
                  Escribe el número exacto y luego la palabra <strong>{COUNTER_CONFIRM_WORD}</strong>. Sirve cuando un
                  clic se dio dos veces: la base reemplaza el valor, no lo suma.
                </p>
                <Field
                  label="Valor exacto"
                  hint="Entero de 0 a 100 000."
                  inputMode="numeric"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <Field
                  label={`${ADMIN_COPY.confirmPrompt} ${COUNTER_CONFIRM_WORD}`}
                  autoComplete="off"
                  value={word}
                  onChange={(event) => setWord(event.target.value)}
                />
                <div className="zm-admin__actions">
                  <Button
                    variant="primary"
                    busy={busy === key}
                    disabled={busy !== null || exact === null || word.trim() !== COUNTER_CONFIRM_WORD}
                    onClick={() => {
                      if (exact !== null) void run({ key, set: exact });
                    }}
                  >
                    Guardar valor
                  </Button>
                  <Button variant="ghost" onClick={() => setCorrecting(null)}>
                    {ADMIN_COPY.cancel}
                  </Button>
                </div>
              </div>
            ) : null}
            <p className="zm-detail__muted">
              {row
                ? `Último movimiento · ${stamp(row.actualizadoEn)}${row.actualizadoPor ? ` · ${row.actualizadoPor}` : ""}`
                : "Sin movimientos registrados."}
            </p>
          </Frame>
        );
      })}
    </div>
  );
}
