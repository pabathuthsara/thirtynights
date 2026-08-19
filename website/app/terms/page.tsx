import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

const title = "Terms & Conditions Placeholder — Thirty Nights";
const description = "A local draft placeholder for the Thirty Nights terms and conditions.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [] },
  twitter: { card: "summary", title, description, images: [] },
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="TERMS & CONDITIONS"
      title="Simple terms for a quiet, personal product."
      intro="This is a local drafting placeholder, not final legal language. It must be reviewed and completed before publication."
    >
      <p className="legal-date">Drafted August 18, 2026</p>

      <section>
        <h2>1. Using Thirty Nights</h2>
        <p>
          Thirty Nights provides nightly prompts, local voice recording, optional account
          backup, and private reflection features. You are responsible for the account and
          device you use to access the service.
        </p>
      </section>

      <section>
        <h2>2. Your recordings</h2>
        <p>
          You keep ownership of the recordings and other content you create. You grant the
          service only the limited permission needed to store, process, and return that
          content when you enable those features.
        </p>
      </section>

      <section>
        <h2>3. Purchases</h2>
        <p>
          The first seven nights are included. The thirty-night continuation is intended as
          a one-time in-app purchase, not a subscription. Final store pricing, refund, tax,
          and regional purchase language will be inserted before launch.
        </p>
      </section>

      <section>
        <h2>4. Responsible use</h2>
        <p>
          Do not misuse the service, attempt to access another person’s recordings, interfere
          with security, or use the product in a way that violates applicable law.
        </p>
      </section>

      <section>
        <h2>5. Availability and wellbeing</h2>
        <p>
          The service may change or occasionally be unavailable. Thirty Nights is a reflection
          tool, not medical care, therapy, crisis support, or professional advice.
        </p>
      </section>

      <section>
        <h2>6. Final legal review needed</h2>
        <p>
          Warranty disclaimers, liability limits, governing law, dispute terms, termination,
          age requirements, and contact details remain placeholders for qualified review.
        </p>
      </section>
    </LegalShell>
  );
}
