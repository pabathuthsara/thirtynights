import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

const title = "Privacy Policy Placeholder — Thirty Nights";
const description = "A local draft placeholder for the Thirty Nights privacy policy.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [] },
  twitter: { card: "summary", title, description, images: [] },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="PRIVACY POLICY"
      title="Your voice should never be a mystery to you—or to us."
      intro="This page is a working local placeholder that describes the product’s intended privacy behavior. It is not the final reviewed policy."
    >
      <p className="legal-date">Drafted August 18, 2026</p>

      <section>
        <h2>1. The short version</h2>
        <p>
          Thirty Nights starts local. A new voice recording is saved on your device.
          Cloud backup and reflection processing happen only after you make an explicit choice.
        </p>
      </section>

      <section>
        <h2>2. Information you choose to provide</h2>
        <p>
          The app may hold your email address, nightly audio recordings, recording dates,
          durations, transcripts, reflection reports, reminder settings, and purchase status.
        </p>
      </section>

      <section>
        <h2>3. Backup and reflection processing</h2>
        <p>
          When enabled, Supabase stores recordings and related night/date metadata for your
          private account. OpenAI may transcribe recordings and use those transcripts to
          create private reflections. Data is encrypted in transit and at rest, but the
          product does not claim end-to-end encryption.
        </p>
      </section>

      <section>
        <h2>4. Your choices</h2>
        <p>
          You can keep recordings on-device, choose Wi-Fi-only backup, withdraw future
          processing permission, export your available archive, or request deletion.
          Withdrawing permission stops future uploads and processing; deletion controls are
          used to remove stored account data.
        </p>
      </section>

      <section>
        <h2>5. Retention and providers</h2>
        <p>
          Final retention periods, subprocessors, international transfer language, and
          regional rights will be added after legal review and before this policy is published.
        </p>
      </section>

      <section>
        <h2>6. Contact</h2>
        <p>
          Placeholder privacy contact: <a href="mailto:privacy@thirtynights.app">privacy@thirtynights.app</a>.
          Replace or confirm this address before launch.
        </p>
      </section>
    </LegalShell>
  );
}
