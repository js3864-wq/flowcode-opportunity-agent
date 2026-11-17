import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Opportunity Radar for Flowcode",
  description: "Researches what a company is doing right now and ranks where Flowcode can help, with sources.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-paper focus:p-2">
          Skip to content
        </a>
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
            <Link href="/" className="display text-lg no-underline">
              Opportunity Radar
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <Link href="/" className="hover:underline">
                Watchlist
              </Link>
              <Link href="/run" className="rounded-md bg-ink px-3 py-1.5 font-medium text-paper hover:bg-ink/85">
                Research a company
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </main>
        <footer className="mx-auto max-w-6xl px-5 pb-10 text-sm text-muted sm:px-8">
          Built as a take-home for Flowcode. Research by Claude with live web search. Every claim links to its source.
        </footer>
      </body>
    </html>
  );
}
