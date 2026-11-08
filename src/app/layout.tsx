import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ThemeBootScript } from "@/ui/design/theme";
import { SoundBoot } from "@/ui/feedback/sound-boot";

import { atkinson, pixelify } from "./fonts";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#101826",
};

export const metadata: Metadata = {
  title: "ZooMatch",
  description: "Un microtest anonimo para descubrir afinidades entre estudiantes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-MX" className={`${pixelify.variable} ${atkinson.variable}`} suppressHydrationWarning>
      <head>
        <ThemeBootScript />
      </head>
      <body>
        <SoundBoot />
        {children}
      </body>
    </html>
  );
}
