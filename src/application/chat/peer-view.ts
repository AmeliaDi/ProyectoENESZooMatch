/**
 * What a participant may see of the other person in a chat: their stored
 * identity, with the wing tone and mark only under the same opt-in as the
 * constellation. Never a user id, and never a name assembled here — the chat
 * renders it through `formatIdentity()`, so the alias in a row, in a bubble
 * and in the constellation is the very same string.
 */
import type { ChatPeerDto } from "@/contracts/chat";

import { counterpartIdentity, EGG_IDENTITY_DTO } from "../identity-dto";

import type { ChatPeer } from "./conversation-ports";

export function toPeerDto(peer: ChatPeer | undefined): ChatPeerDto {
  if (!peer || peer.alias === null) return { identity: EGG_IDENTITY_DTO };
  return {
    identity: counterpartIdentity({
      userId: peer.userId,
      estadoIdentidad: "eclosionado",
      aliasCompleto: peer.alias,
      aliasAnimal: null,
      aliasColor: null,
      aliasSufijo: null,
      mbtiCode: null,
      enneagramCode: null,
      // The chat reads neither the latent profile nor the shared reading layers.
      latent: null,
      animalId: peer.animalId,
      colorId: peer.colorId,
      mark: peer.mark,
      showAvatarDetail: peer.showAvatarDetail,
      sharedLayers: [],
    }),
  };
}
