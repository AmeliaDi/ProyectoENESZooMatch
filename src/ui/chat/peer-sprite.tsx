"use client";

/**
 * The sprite of the other person, drawn only from the animal and colour ids
 * frozen in their identity. Its accessible name is the very string printed
 * beside it, so a screen reader never hears a different person than the eye
 * sees. An egg has no sprite and is never rendered.
 */
import type { IdentityDto } from "@/contracts/identity";
import { formatIdentity } from "@/domain/identity/format-identity";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { Icon } from "@/ui/kit/icon";
import { isHatched } from "@/ui/shared/parse-identity";

export function PeerSprite({ identity, size }: { identity: IdentityDto; size: number }) {
  const name = formatIdentity(identity);
  const animalId = identity.animalId;
  const colorId = identity.colorId;
  const drawn = isHatched(identity) && animalId !== null && colorId !== null;
  return (
    <span className="zm-box zm-box--flat zm-convo__sprite" role="img" aria-label={name.ariaLabel}>
      {drawn ? (
        <PixelAnimal animalId={animalId} colorId={colorId} mark={identity.mark} size={size} animated={false} />
      ) : (
        <Icon name="loading" filled />
      )}
    </span>
  );
}
