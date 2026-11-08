"use client";

/**
 * Pixel-art SVG icons for each mood status.
 * Each icon is drawn on a 12x12 grid following the existing icon system style.
 */

import type { AnimoPublicado } from "@/config/animo";

interface StatusIconProps {
  mood: AnimoPublicado;
  className?: string;
}

/**
 * Simple pixel-art representations for each mood.
 * These use basic SVG shapes to create recognizable icons at small sizes.
 */
export function StatusIconSvg({ mood, className }: StatusIconProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {renderMoodIcon(mood)}
    </svg>
  );
}

function renderMoodIcon(mood: AnimoPublicado) {
  switch (mood) {
    case "cansancio":
      // Half-closed eye (tired)
      return (
        <g fill="currentColor">
          <rect x="2" y="5" width="8" height="1" />
          <rect x="3" y="4" width="6" height="1" />
          <rect x="4" y="6" width="4" height="1" />
          <rect x="3" y="7" width="6" height="1" />
        </g>
      );
    case "ansiedad":
      // Wavy lines (restless)
      return (
        <g fill="currentColor">
          <rect x="1" y="3" width="2" height="1" />
          <rect x="5" y="3" width="2" height="1" />
          <rect x="9" y="3" width="2" height="1" />
          <rect x="3" y="5" width="2" height="1" />
          <rect x="7" y="5" width="2" height="1" />
          <rect x="1" y="7" width="2" height="1" />
          <rect x="5" y="7" width="2" height="1" />
          <rect x="9" y="7" width="2" height="1" />
        </g>
      );
    case "ganas_de_platicar":
      // Speech bubble
      return (
        <g fill="currentColor">
          <rect x="2" y="2" width="8" height="1" />
          <rect x="1" y="3" width="10" height="1" />
          <rect x="1" y="4" width="10" height="1" />
          <rect x="1" y="5" width="10" height="1" />
          <rect x="2" y="6" width="8" height="1" />
          <rect x="3" y="7" width="2" height="1" />
          <rect x="2" y="8" width="1" height="1" />
        </g>
      );
    case "necesito_un_abrazo":
      // Two figures close together (hug)
      return (
        <g fill="currentColor">
          <rect x="3" y="2" width="2" height="2" />
          <rect x="7" y="2" width="2" height="2" />
          <rect x="2" y="4" width="4" height="3" />
          <rect x="6" y="4" width="4" height="3" />
          <rect x="4" y="5" width="4" height="1" />
          <rect x="3" y="7" width="2" height="2" />
          <rect x="7" y="7" width="2" height="2" />
        </g>
      );
    case "alegria":
      // Smiling face
      return (
        <g fill="currentColor">
          <rect x="3" y="1" width="6" height="1" />
          <rect x="2" y="2" width="1" height="1" />
          <rect x="9" y="2" width="1" height="1" />
          <rect x="1" y="3" width="1" height="4" />
          <rect x="10" y="3" width="1" height="4" />
          <rect x="4" y="4" width="1" height="1" />
          <rect x="7" y="4" width="1" height="1" />
          <rect x="3" y="6" width="1" height="1" />
          <rect x="4" y="7" width="4" height="1" />
          <rect x="8" y="6" width="1" height="1" />
          <rect x="2" y="8" width="8" height="1" />
          <rect x="3" y="9" width="6" height="1" />
        </g>
      );
    case "concentracion":
      // Target/focus circle
      return (
        <g fill="currentColor">
          <rect x="4" y="1" width="4" height="1" />
          <rect x="2" y="2" width="2" height="1" />
          <rect x="8" y="2" width="2" height="1" />
          <rect x="1" y="3" width="1" height="4" />
          <rect x="10" y="3" width="1" height="4" />
          <rect x="5" y="4" width="2" height="1" />
          <rect x="4" y="5" width="4" height="1" />
          <rect x="5" y="6" width="2" height="1" />
          <rect x="2" y="8" width="2" height="1" />
          <rect x="8" y="8" width="2" height="1" />
          <rect x="4" y="9" width="4" height="1" />
        </g>
      );
  }
}
