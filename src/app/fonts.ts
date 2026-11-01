import { Atkinson_Hyperlegible_Next, Pixelify_Sans } from "next/font/google";

/**
 * Both families are OFL (verified in google/fonts, see docs/DISENO.md) and are
 * downloaded at build time by next/font, then served from our own origin: no
 * runtime CDN, CSP stays `font-src 'self'`. `latin-ext` covers á é í ó ú ü ñ ¿ ¡.
 */
export const pixelify = Pixelify_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-pixelify",
  fallback: ["Courier New", "monospace"],
});

export const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-atkinson",
  fallback: ["Verdana", "sans-serif"],
});
