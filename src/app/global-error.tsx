"use client";

import { ThemeBootScript } from "@/ui/design/theme";
import { ErrorView } from "@/ui/shared/lost-view";

import { atkinson, pixelify } from "./fonts";
import "./globals.css";

/** Replaces the root layout when it fails, so it brings its own document, fonts and theme. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es-MX" className={`${pixelify.variable} ${atkinson.variable}`} suppressHydrationWarning>
      <head>
        <title>Se nubló algo | ZooMatch</title>
        <ThemeBootScript />
      </head>
      <body>
        <ErrorView onRetry={retry} />
      </body>
    </html>
  );
}
