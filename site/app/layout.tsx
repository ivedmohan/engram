import type { Metadata } from "next";
import { Newsreader, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Type and palette from DESIGN.md at the repo root (Mistral AI brand analysis, fetched via
// `npx getdesign add mistral.ai`) — Newsreader stands in for the brand's "PP Editorial Old"
// (a paid font not available via next/font/google), Inter and JetBrains Mono are exact matches.
const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Engram — one memory, read by every AI tool on your machine",
  description:
    "A local-first memory layer backed by a graph in FalkorDB. Claude Code, Cursor, and Gemini CLI all read and write the same memory — decisions supersede each other automatically.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
