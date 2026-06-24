import localFont from "next/font/local";

// Geist fonts are self-hosted from font files bundled in the repo so the build
// never reaches out to Google Fonts (which previously failed with HTTP 502) and
// does not depend on the `geist` npm package resolving at build time.
export const GeistSans = localFont({
  src: "./fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const GeistMono = localFont({
  src: "./fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  adjustFontFallback: false,
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Roboto Mono",
    "Menlo",
    "Monaco",
    "Liberation Mono",
    "DejaVu Sans Mono",
    "Courier New",
    "monospace",
  ],
  weight: "100 900",
});
