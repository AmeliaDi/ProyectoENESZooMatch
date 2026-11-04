"use client";

import { useState } from "react";

import type { AdminUser, AdminUserAction } from "@/contracts/admin";
import { Button } from "@/ui/kit/button";
import { Dialog } from "@/ui/kit/dialog";
import { Field } from "@/ui/kit/field";

import { adminApi } from "./admin-api";
import { ADMIN_COPY, USER_ACTION_COPY, confirmMatches, stamp } from "./admin-copy";

export interface UserDetailProps {
  user: AdminUser | null;
  /** `changed` = an action ran, so the list must reload. */
  onClose(changed: boolean): void;
  onUnauthorized(): void;
}

/** Actions offered for one account; admins cannot be deleted from here. */
export function availableActions(user: AdminUser): AdminUserAction[] {
  const actions: AdminUserAction[] = [];
  if (user.quizCompletedAt) actions.push("reset_quiz");
  actions.push(user.paused ? "resume" : "pause");
  if (user.hasChatPin) actions.push("reset_chat_pin");
  if (!user.isAdmin) actions.push("delete");
  return actions;
}

function facts(user: AdminUser): Array<[string, string]> {
  return [
    ["Animalito", user.animal ? `${user.animal} · ${user.color ?? ""}` : "—"],
    ["MBTI", user.mbti ?? "—"],
    ["Alta", stamp(user.createdAt)],
    ["Cuestionario", user.quizCompletedAt ? stamp(user.quizCompletedAt) : "Sin completar"],
    ["Módulos extra", String(user.modules)],
    ["Estado", user.paused ? "Pausado" : "Activo"],
    ["Mayor de edad declarado", user.adult ? "Sí" : "No"],
    ["Afinidades romance / amistad", `${user.romanceMatches} / ${user.amistadMatches}`],
    ["Conversaciones", String(user.conversations)],
    ["Reportes recibidos", String(user.reportsReceived)],
    ["PIN de chats", user.hasChatPin ? "Creado" : "Sin crear"],
  ];
}

export function UserDetail({ user, onClose, onUnauthorized }: UserDetailProps) {
  const [pending, setPending] = useState<AdminUserAction | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  function close() {
    const didChange = changed;
    setPending(null);
    setTyped("");
    setMessage(null);
    setChanged(false);
    onClose(didChange);
  }

  async function run(action: AdminUserAction) {
    if (!user || busy) return;
    setBusy(true);
    const result = await adminApi.userAction(user.id, action);
    setBusy(false);
    if (!result.ok && result.reason === "unauthorized") return onUnauthorized();
    if (!result.ok) return setMessage(result.message ?? ADMIN_COPY.readError);
    const pendingRecompute = "recomputePending" in result.value && result.value.recomputePending === true;
    setMessage(pendingRecompute ? ADMIN_COPY.actionPending : ADMIN_COPY.actionDone);
    setChanged(true);
    setPending(null);
    setTyped("");
    if (action === "delete") onClose(true);
  }

  if (!user) return <Dialog open={false} onClose={close} title="">{null}</Dialog>;
  const word = pending ? USER_ACTION_COPY[pending].confirmWord : null;

  return (
    <Dialog open onClose={close} title={user.alias ?? ADMIN_COPY.noAlias}>
      <dl className="zm-admin__facts">
        {facts(user).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <p role="status" aria-live="polite" className="zm-detail__muted">{message ?? ""}</p>
      {pending ? (
        <div className="zm-box zm-admin__confirm">
          <p><strong>{USER_ACTION_COPY[pending].label}.</strong> {USER_ACTION_COPY[pending].body}</p>
          {word ? (
            <Field label={`${ADMIN_COPY.confirmPrompt} ${word}`} name="admin-confirm" autoComplete="off" value={typed}
              onChange={(e) => setTyped(e.target.value)} />
          ) : null}
          <div className="zm-admin__actions">
            <Button variant={pending === "delete" ? "danger" : "primary"} busy={busy}
              disabled={busy || !confirmMatches(pending, typed)} onClick={() => void run(pending)}>
              {USER_ACTION_COPY[pending].label}
            </Button>
            <Button variant="ghost" onClick={() => { setPending(null); setTyped(""); }}>{ADMIN_COPY.cancel}</Button>
          </div>
        </div>
      ) : (
        <div className="zm-admin__actions">
          {availableActions(user).map((action) => (
            <Button key={action} variant={action === "delete" ? "danger" : "secondary"} {...(action === "delete" ? { icon: "delete" as const } : {})}
              onClick={() => { setPending(action); setMessage(null); }}>
              {USER_ACTION_COPY[action].label}
            </Button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
