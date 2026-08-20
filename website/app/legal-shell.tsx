import Image from "next/image";
import type { ReactNode } from "react";

export function LegalShell({
  eyebrow,
  title,
  intro,
  updated = "August 20, 2026",
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <nav className="nav shell" aria-label="Legal page navigation">
        {/* A full document navigation is intentional for reliable Vinext routing. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/" aria-label="Thirty Nights home">
          <Image src="/icon.png" alt="" width={38} height={38} priority />
          <span>Thirty Nights</span>
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="nav-download" href="/">Back to the landing page</a>
      </nav>

      <header className="legal-hero shell">
        <p className="eyebrow">✦ {eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="legal-status">Effective and last updated {updated}</div>
      </header>

      <article className="legal-content shell">
        {children}
      </article>

      <footer className="legal-footer">
        <div className="shell footer-bottom">
          <span>© {new Date().getFullYear()} Thirty Nights</span>
          <span>
            <a href="/privacy">Privacy</a>
            {" · "}
            <a href="/terms">Terms</a>
            {" · "}
            <a href="/support">Support</a>
            {" · "}
            <a href="/delete-account">Account deletion</a>
          </span>
        </div>
      </footer>
    </main>
  );
}
