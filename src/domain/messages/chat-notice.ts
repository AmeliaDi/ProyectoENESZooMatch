/**
 * The only notification the chat produces. It never carries message text,
 * the other alias or which conversation changed (docs/CHAT.md §3).
 */
export const CHAT_NOTICE = {
  title: "Tienes novedades en tus chats",
  body: "Abre tus chats con tu PIN para verlas.",
} as const;
