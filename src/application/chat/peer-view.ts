/**
 * What a participant may see of the other person in a chat: the identity the
 * adapter already projected from the stored columns, with that person's own
 * sharing choices applied. Never a user id, and never a name assembled here —
 * the chat renders it through `formatIdentity()`, so the alias in a row, in a
 * bubble and in the constellation is the very same string.
 */
import type { ChatPeerDto } from "@/contracts/chat";

import { EGG_IDENTITY_DTO } from "../identity-dto";

import type { ChatPeer } from "./conversation-ports";

export function toPeerDto(peer: ChatPeer | undefined): ChatPeerDto {
  return { identity: peer?.identity ?? EGG_IDENTITY_DTO };
}