import Image from "next/image";
import Link from "next/link";
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
        <Link className="brand" href="/" aria-label="Thirty Nights home">
          <Image src="/icon.png" alt="" width={38} height={38} priority />
          <span>Thirty Nights</span>
        </Link>
        <Link className="nav-download" href="/">Back to the landing page</Link>
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
            <Link href="/privacy">Privacy</Link>
            {" · "}
            <Link href="/terms">Terms</Link>
            {" · "}
            <Link href="/support">Support</Link>
            {" · "}
            <Link href="/delete-account">Account deletion</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
