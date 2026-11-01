"use client";

/**
 * Page chrome shared by every public screen: the pixel sky, the icon atlas
 * (mounted once here, so pages never forget it), a compact header with the
 * brand and an optional trailing slot, and a polite "estadística, no valor"
 * footer. One shell keeps every screen on the same logical pixel.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { IconAtlas } from "./icon";
import { PixelSky } from "./pixel-sky";

export interface AtlasShellProps {
  /** Small atlas coordinate shown next to the brand, e.g. "01 · entrada". */
  plate?: string;
  /** Right side of the header (settings link, theme…). */
  actions?: ReactNode;
  children: ReactNode;
  /** Hide the footer on full-bleed screens (the constellation). */
  bare?: boolean;
  /** Parallax offset forwarded to the sky. */
  skyOffset?: { x: number; y: number };
}

export function AtlasShell({ plate, actions, children, bare = false, skyOffset }: AtlasShellProps) {
  return (
    <div className="zm-root zm-shell">
      <IconAtlas />
      <PixelSky className="zm-shell__sky" offsetX={skyOffset?.x ?? 0} offsetY={skyOffset?.y ?? 0} />
      <header className="zm-shell__head">
        <Link href="/" className="zm-shell__brand">
          <span className="zm-shell__mark" aria-hidden="true" />
          ZooMatch
        </Link>
        {plate ? (
          <span className="zm-shell__plate" aria-hidden="true">
            {plate}
          </span>
        ) : null}
        <div className="zm-shell__actions">{actions}</div>
      </header>
      <div className="zm-shell__body">{children}</div>
      {bare ? null : (
        <footer className="zm-shell__foot">
          Proyecto estadístico de la ENES · no es evaluación psicológica ni una medida de tu valor
        </footer>
      )}
    </div>
  );
}
