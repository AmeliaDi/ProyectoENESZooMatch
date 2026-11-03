"use client";

import type { ChatPeerDto } from "@/contracts/chat";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { Icon } from "@/ui/kit/icon";

/** Decorative sprite of the other person (the alias next to it is the text). */
export function PeerSprite({ peer, size }: { peer: ChatPeerDto; size: number }) {
  return (
    <span className="zm-box zm-box--flat zm-convo__sprite" aria-hidden="true">
      {peer.animal_id && peer.color_id ? (
        <PixelAnimal animalId={peer.animal_id} colorId={peer.color_id} mark={peer.mark} size={size} animated={false} />
      ) : (
        <Icon name="loading" filled />
      )}
    </span>
  );
}
