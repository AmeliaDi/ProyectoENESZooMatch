/**
 * Opaque per-viewer handle of a match: the result view keys nodes with it and
 * the chat resolves it back against the viewer's current matches. It is not
 * reversible to a user id and differs for each viewer.
 */
const OPAQUE_ID_LENGTH = 16;

export function matchHandle(viewer: string, other: string, digest: (input: string) => string): string {
  return digest(`${viewer}:${other}`).slice(0, OPAQUE_ID_LENGTH);
}
