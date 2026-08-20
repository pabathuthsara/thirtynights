import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

const title = "Support — Thirty Nights";
const description = "Get help with your Thirty Nights account, recordings, purchases, privacy, or data deletion.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [] },
  twitter: { card: "summary", title, description, images: [] },
};

export default function SupportPage() {
  return (
    <LegalShell
      eyebrow="SUPPORT"
      title="How can we help?"
      intro="Tell us what went wrong without sending the private words you recorded. We’ll help with accounts, backup, reflections, purchases, and deletion."
    >
      <p className="legal-date">Effective August 20, 2026</p>

      <section className="request-card">
        <p className="eyebrow">CONTACT SUPPORT</p>
        <h2>Email the Thirty Nights team</h2>
        <p>
          Include your app platform, app version, sign-in method, and a short description of
          the screen or action that failed. Never send your password, authentication code,
          full purchase token, recording, transcript, or reflection report by email.
        </p>
        <a className="store-button request-button" href="mailto:privacy@thirtynights.app?subject=Thirty%20Nights%20support%20request">
          Email support
        </a>
        <small>Support and privacy: privacy@thirtynights.app</small>
      </section>

      <section>
        <h2>Before contacting us</h2>
        <ul className="legal-list">
          <li><b>Backup or sync:</b> confirm that you are signed in, processing permission is enabled, and your selected Wi-Fi or cellular connection is available.</li>
          <li><b>Purchase:</b> use Settings → Restore purchases. The app store controls payment and refund decisions.</li>
          <li><b>Export:</b> keep the app open while it prepares the archive; unavailable cloud audio may make an export partial.</li>
          <li><b>Account deletion:</b> use Settings → Privacy → Delete everything, or follow the <a href="/delete-account">web deletion instructions</a>.</li>
        </ul>
      </section>

      <section>
        <h2>Privacy and security reports</h2>
        <p>
          For a privacy request or a suspected security issue, email
          <a href="mailto:privacy@thirtynights.app"> privacy@thirtynights.app</a> with a clear
          subject line. Do not include sensitive journal content. We may ask you to verify account
          ownership through a safer channel before discussing account-specific information.
        </p>
      </section>

      <section>
        <h2>Not an emergency service</h2>
        <p>
          Thirty Nights is not monitored as a crisis or emergency channel. If you or another
          person may be in immediate danger, contact local emergency services or an appropriate
          crisis resource where you live.
        </p>
      </section>
    </LegalShell>
  );
}
