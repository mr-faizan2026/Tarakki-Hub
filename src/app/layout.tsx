import type { Metadata, Viewport } from "next";
import { satoshi, clash, fraunces } from "@/lib/fonts";
import { Providers } from "./providers";
import "./globals.css";

const SITE_URL = "https://tarakkihub.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tarakki Hub — List your catalog in seconds, not hours",
    template: "%s · Tarakki Hub",
  },
  description:
    "Tarakki Hub is a listing tool for Meesho sellers. Save a template once, autofill any catalog in one click, bulk-list from a CSV, and cut your shipping cost per order.",
  keywords: [
    "Meesho seller tools",
    "Meesho listing autofill",
    "bulk product listing",
    "reusable listing templates",
    "Meesho shipping cost",
    "Tarakki Hub",
  ],
  authors: [{ name: "Tarakki Hub" }],
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: "Tarakki Hub",
    title: "List your catalog in seconds, not hours",
    description:
      "Save a template once, autofill any catalog in one click, bulk-list from a CSV, and cut your shipping cost per order. Built for Meesho sellers.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tarakki Hub — List your catalog in seconds",
    description:
      "Autofill listings from a saved template, list in bulk, and cut shipping cost. Built for Meesho sellers.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#16293b" },
  ],
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${satoshi.variable} ${clash.variable} ${fraunces.variable}`}
    >
      <body className="min-h-dvh bg-canvas text-ink-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
