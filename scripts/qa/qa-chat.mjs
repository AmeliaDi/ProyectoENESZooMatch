// Chat between matches end to end (docs/CHAT.md §10–12), only between the two
// QA accounts. Called from qa-api.mjs with its helpers; returns nothing, adds rows.
export async function chatChecks({ a, b, aLock, row, post, get, withLock, lockCookie, aSeesB, bSeesA }) {
  const track = aSeesB.track;
  const bogus = await post("/api/interest", { match: "0123456789abcdef", track }, a.cookie);
  row("señal a un handle que no es match", bogus.status, bogus.status === 409);
  if (track === "romance") {
    const noAdult = await post("/api/interest", { match: aSeesB.id, track }, a.cookie);
    row("romance sin 18+ declarado", noAdult.status, noAdult.status === 403);
    for (const s of [a, b]) await post("/api/interest/adult", {}, s.cookie);
  }
  const sent = await (await post("/api/interest", { match: aSeesB.id, track }, a.cookie)).json();
  row("señal enviada", sent.state, sent.state === "sent");
  const bStates = await (await get("/api/interest", b)).json();
  row("quien recibe ve una invitación", JSON.stringify(Object.values(bStates.states ?? {})), Object.values(bStates.states ?? {}).some((x) => x.state === "invited"));
  const declined = await post("/api/interest/decline", { match: bSeesA.id, track }, b.cookie);
  const aAfterDecline = await (await get("/api/interest", a)).json();
  row("«ahora no» es silencioso para quien envió", `${declined.status} / ${JSON.stringify(Object.values(aAfterDecline.states ?? {}))}`, declined.status === 200 && Object.values(aAfterDecline.states ?? {}).every((x) => x.state === "sent"));
  const opened = await (await post("/api/interest", { match: bSeesA.id, track }, b.cookie)).json();
  row("mismo gesto abre el chat", opened.state, opened.state === "open" && /^[0-9a-f-]{36}$/.test(opened.conversation));
  const conv = opened.conversation;
  const locked = await get(`/api/chat/conversations/${conv}`, a);
  row("conversación sin candado", locked.status, locked.status === 423);
  const bPin = await post("/api/chat/pin", { pin: "5926", confirm: "5926" }, b.cookie);
  const bLock = withLock(b, lockCookie(bPin));
  const inboxA = await (await get("/api/chat/inbox", aLock)).json();
  row("inbox con la conversación y sin ids", inboxA.conversations?.length, inboxA.conversations?.length === 1 && !/user|matricula|hash/i.test(JSON.stringify(inboxA)));

  const views = { a: await (await get(`/api/chat/conversations/${conv}`, aLock)).json(), b: await (await get(`/api/chat/conversations/${conv}`, bLock)).json() };
  const asker = views.a.ask ? "a" : "b";
  const askerLock = asker === "a" ? aLock : bLock;
  const otherLock = asker === "a" ? bLock : aLock;
  const cards = views[asker].ask?.suggestions ?? [];
  row("3 tarjetas solo a quien le toca", `${cards.length} / ${views[asker === "a" ? "b" : "a"].ask}`, cards.length === 3 && views[asker === "a" ? "b" : "a"].ask === null);
  const others = await (await get(`/api/chat/conversations/${conv}?refresh=1`, askerLock)).json();
  row("«otras tres» cambia las tarjetas", others.ask?.suggestions?.map((c) => c.id).join(","), JSON.stringify(others.ask?.suggestions) !== JSON.stringify(cards));
  const own = await post(`/api/chat/conversations/${conv}/ask`, { customText: "¿Pregunta propia?" }, askerLock.cookie);
  row("pregunta propia antes del chat libre", own.status, own.status === 409);
  await post(`/api/chat/conversations/${conv}/ask`, { promptId: cards[0].id }, askerLock.cookie);
  const tooLong = await post(`/api/chat/conversations/${conv}/answer`, { round: 0, body: "a".repeat(301) }, askerLock.cookie);
  row("301 grafemas rechazados", tooLong.status, tooLong.status === 400);
  const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
  const exact = await (await post(`/api/chat/conversations/${conv}/answer`, { round: 0, body: `${"b".repeat(299)}${family}` }, otherLock.cookie)).json();
  row("300 grafemas con emoji ZWJ aceptados", exact.rounds?.[0]?.mine ? "ok" : "no", typeof exact.rounds?.[0]?.mine === "string" && exact.rounds?.[0]?.theirs === null);
  const ans = await (await post(`/api/chat/conversations/${conv}/answer`, { round: 0, body: "Respuesta QA de ronda 1" }, askerLock.cookie)).json();
  row("respuestas reveladas juntas", `${ans.rounds?.[0]?.revealed}`, ans.rounds?.[0]?.revealed === true && typeof ans.rounds?.[0]?.theirs === "string");
  const next = await (await get(`/api/chat/conversations/${conv}`, otherLock)).json();
  await post(`/api/chat/conversations/${conv}/ask`, { promptId: next.ask?.suggestions?.[0]?.id }, otherLock.cookie);
  await post(`/api/chat/conversations/${conv}/answer`, { round: 1, body: "Respuesta QA sellada" }, otherLock.cookie);
  const sealed = await (await get(`/api/chat/conversations/${conv}`, askerLock)).json();
  row("respuesta ajena sellada", JSON.stringify(sealed.rounds?.[1]?.theirs), sealed.rounds?.[1]?.theirs === null && !JSON.stringify(sealed).includes("Respuesta QA sellada"));
  const passed = await (await post(`/api/chat/conversations/${conv}/answer`, { round: 1, pass: true }, askerLock.cookie)).json();
  row("«Pasar» revela la ronda", `${passed.rounds?.[1]?.revealed} / passed=${passed.rounds?.[1]?.minePassed}`, passed.rounds?.[1]?.revealed === true && passed.rounds?.[1]?.minePassed === true);
  const early = await post(`/api/chat/conversations/${conv}/messages`, { body: "hola", clientKey: "00000000-0000-4000-9000-00000000a001" }, aLock.cookie);
  row("sin chat libre antes de 3 rondas", early.status, early.status === 409);

  const blocked = await post(`/api/chat/conversations/${conv}/block`, {}, bLock.cookie);
  row("bloquear (silencioso)", blocked.status, blocked.status === 200);
  const after = await get(`/api/chat/conversations/${conv}`, aLock);
  row("conversación desaparece para ambas", after.status, after.status === 404);
  const again = await post("/api/interest", { match: aSeesB.id, track }, a.cookie);
  row("bloqueo se ve como match que ya no está", again.status, again.status === 409);
  const notes = await (await get("/api/notifications", a)).json();
  const chatNotes = (notes.notifications ?? []).filter((n) => n.type === "chat");
  row("aviso de chat sin contenido", chatNotes.length, chatNotes.every((n) => !/Respuesta QA|alias/i.test(n.title + n.body)));


}
