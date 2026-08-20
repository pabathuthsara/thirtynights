import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

const title = "Delete Your Account — Thirty Nights";
const description = "How to permanently delete a Thirty Nights account, cloud recordings, transcripts, and reflections.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [] },
  twitter: { card: "summary", title, description, images: [] },
};

export default function DeleteAccountPage() {
  return (
    <LegalShell
      eyebrow="ACCOUNT DELETION"
      title="Delete your nights when you choose."
      intro="You can permanently delete your account and associated cloud data from the app. If you cannot open the app, you can start a verified deletion request here."
    >
      <p className="legal-date">Effective August 20, 2026</p>

      <section>
        <h2>Delete from the app</h2>
        <ol className="delete-steps">
          <li><span>1</span><p>Open <b>Thirty Nights</b> and go to <b>Settings</b>.</p></li>
          <li><span>2</span><p>Under <b>Privacy</b>, choose <b>Delete everything</b>.</p></li>
          <li><span>3</span><p>Choose <b>Delete cloud account and this device</b>.</p></li>
          <li><span>4</span><p>Review the warning and confirm the permanent deletion.</p></li>
        </ol>
      </section>

      <section className="request-card">
        <p className="eyebrow">DELETE WITHOUT THE APP</p>
        <h2>Cannot open the app?</h2>
        <p>
          Email us from the address connected to your Thirty Nights account. Include “Delete my
          Thirty Nights account” and the sign-in method you used. Do not attach recordings,
          transcripts, passwords, access codes, or payment-card details. We will verify ownership
          before deleting the account and normally complete a valid request within 30 days.
        </p>
        <a className="store-button request-button" href="mailto:privacy@thirtynights.app?subject=Delete%20my%20Thirty%20Nights%20account">
          Start a deletion request
        </a>
        <small>Requests: privacy@thirtynights.app</small>
      </section>

      <section>
        <h2>What deletion covers</h2>
        <p>
          A successful cloud-account deletion removes your Thirty Nights authentication account,
          account profile, schedule and night metadata, cloud recordings, transcripts, reflections,
          report audio, processing-consent records, and the RevenueCat app-user record. If you used
          Sign in with Apple, the service also attempts to revoke its stored Apple refresh token.
        </p>
      </section>

      <section>
        <h2>What is not removed automatically</h2>
        <p>
          A web request cannot reach files stored only on your phone. After we confirm cloud deletion,
          clear the app’s local data or uninstall the app to remove device-only recordings and settings.
          Apple and Google control app-store transaction records, and deleting Thirty Nights does not
          itself issue a refund. Minimal one-way-hashed deletion audit information and provider backup
          copies may remain for the limited purposes and periods described in our <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>Delete device data without deleting your account</h2>
        <p>
          In Settings → Privacy → Delete everything, choose <b>Delete this device only</b>. This removes
          local recordings and app state from that device but leaves your cloud account, cloud content,
          and store purchases available for synchronization or restoration.
        </p>
      </section>
    </LegalShell>
  );
}
