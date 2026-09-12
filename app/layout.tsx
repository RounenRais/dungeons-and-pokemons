import type { Metadata } from "next";
import {
  Marcellus,
  Source_Sans_3,
  Caveat,
  Press_Start_2P,
} from "next/font/google";
import "./globals.css";

/*
 * Typography. Cinzel + EB Garamond read as a 17th-century book — too heavy and
 * too archaic. This set keeps the adventure-map feel but is much easier to
 * read: Marcellus is a softer take on the same Roman capitals, and Source Sans
 * carries every bit of running text and UI chrome.
 *
 * All OFL-licensed and self-hosted by next/font at build time, so there is no
 * runtime request to Google.
 */

/** Titles and headings. */
const display = Marcellus({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

/** Everything else: body copy, buttons, labels, numbers. */
const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

/** Map annotations and journal entries — looks written, not typed. */
const hand = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
});

/** The battle UI is GBA-styled; the pixel font is only used there. */
const pixelFont = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pokémon Route Runner",
  description:
    "Choose your path, battle wild Pokémon and build a run — a browser game powered by PokeAPI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${hand.variable} ${pixelFont.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
