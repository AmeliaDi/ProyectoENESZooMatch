/**
 * What a participant may see of the other person in a chat: alias and the
 * public sprite, with the wing tone and mark only under the same opt-in as
 * the constellation. Never a user id.
 */
import { CATALOG_COLORS } from "@/config";
import type { ChatPeerDto } from "@/contracts/chat";
import { publicVisual } from "@/domain/avatars/avatar-spec";

import type { ChatPeer } from "./conversation-ports";

const COLOR_BY_ID = new Map(CATALOG_COLORS.map((c) => [c.id, c]));
/** Same fallback as the result view when an alias is missing. */
export const PEER_FALLBACK_ALIAS = "alguien especial";

export function toPeerDto(peer: ChatPeer | undefined): ChatPeerDto {
  const alias = peer?.alias ?? PEER_FALLBACK_ALIAS;
  if (!peer?.animalId || !peer.colorId) {
    return { alias, animal_id: null, color_id: null, color_hex: null, mark: null };
  }
  const visual = publicVisual({ animalId: peer.animalId, colorId: peer.colorId, mark: peer.mark }, peer.showAvatarDetail);
  return {
    alias,
    animal_id: visual.animalId,
    color_id: visual.colorId,
    color_hex: COLOR_BY_ID.get(visual.colorId)?.hex ?? null,
    mark: visual.mark,
  };
}
