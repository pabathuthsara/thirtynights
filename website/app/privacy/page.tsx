import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

const title = "Privacy Policy — Thirty Nights";
const description = "How Thirty Nights handles waitlist details, voice recordings, account information, purchases, and private reflections.";

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
      title="Your voice belongs to you."
      intro="This policy explains what Thirty Nights collects, what remains on your device, when cloud and AI processing occur, and the choices you have over your information."
    >
      <p className="legal-date">Effective August 20, 2026</p>

      <section>
        <h2>1. Who we are and what this policy covers</h2>
        <p>
          Thirty Nights (“Thirty Nights,” “we,” “us,” or “our”) is a voice-journaling
          service operated from Sri Lanka. This policy covers the Thirty Nights mobile app,
          website, cloud backup, account services, and reflection-processing features.
          Questions can be sent to <a href="mailto:privacy@thirtynights.app">privacy@thirtynights.app</a>.
        </p>
      </section>

      <section>
        <h2>2. The short version</h2>
        <p>
          A new recording is first stored on your device. Your recording audio is uploaded
          only after you connect a permanent account and explicitly enable cloud backup and
          reflection processing. We do not sell personal information, run behavioral ads, or
          send your journal content to an advertising or third-party analytics service.
        </p>
      </section>

      <section>
        <h2>3. Information we handle</h2>
        <p>Depending on the features you use, we handle the following categories:</p>
        <ul className="legal-list">
          <li><b>Journal content:</b> voice recordings, transcripts, generated reflections, selected audio excerpts, and report audio.</li>
          <li><b>Account information:</b> an internal user ID, email address, authentication provider, and Sign in with Apple private-relay status.</li>
          <li><b>Waitlist information:</b> the email address you submit, whether you want iOS, Android, or both launch updates, and the time you joined.</li>
          <li><b>Journey information:</b> question and night identifiers, recording dates and duration, chapter progress, device timezone, reminder preferences, upload consent, and backup state.</li>
          <li><b>Purchase information:</b> product, app store, transaction or order identifiers, currency, price, entitlement, refund, and revocation status. We do not receive your full payment-card number.</li>
          <li><b>Technical and security information:</b> checksums, file size, storage paths, request and error logs, authentication/session data, network availability, and limited device-linked records needed to secure and synchronize the service.</li>
        </ul>
        <p>
          We do not request contacts, precise location, photos, or advertising identifiers.
          Microphone access is used only while you actively record. Nightly notifications are
          scheduled locally on your device.
        </p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <p>
          We use information to create and secure your account; keep your nightly schedule;
          store, synchronize, export, and restore your content; transcribe recordings and
          generate the reflections you request; assemble report audio; verify purchases and
          restore entitlements; send the launch updates you request when you join the waitlist;
          prevent fraud and abuse; respond to support and deletion requests; and comply with
          law. We do not use journal content for advertising.
        </p>
      </section>

      <section>
        <h2>5. Cloud backup and AI-assisted reflections</h2>
        <p>
          Account and schedule metadata may be stored in Supabase when an account is created
          or synchronized. Recording audio remains on your device unless you sign in with a
          permanent account and affirmatively enable processing. When enabled, encrypted
          uploads are stored privately in Supabase. The Thirty Nights worker sends the audio
          to OpenAI’s API for transcription and sends transcript material needed to create
          your private reflection. The results and selected report-audio clips are returned to
          your private account.
        </p>
        <p>
          OpenAI states that API inputs and outputs are not used to train its models by default.
          Under OpenAI’s default API controls, abuse-monitoring logs may be retained for up to
          30 days unless a different approved retention setting or legal requirement applies.
          Thirty Nights does not claim that cloud-processed content is end-to-end encrypted.
        </p>
      </section>

      <section>
        <h2>6. Service providers and disclosures</h2>
        <p>
          We disclose information only as needed to operate the service, complete a transaction,
          follow your direction, protect people and the service, or comply with law. Our main
          service providers are:
        </p>
        <ul className="legal-list provider-list">
          <li><a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase</a> — authentication, database, and private file storage.</li>
          <li><a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer">OpenAI</a> — API transcription and reflection generation after your consent.</li>
          <li><a href="https://www.revenuecat.com/privacy/" target="_blank" rel="noreferrer">RevenueCat</a> — purchase verification and entitlement management.</li>
          <li><a href="https://railway.com/legal/privacy" target="_blank" rel="noreferrer">Railway</a> — hosting for the private background-processing worker and this website.</li>
          <li>Apple and Google — sign-in and app-store purchase processing when you use their services.</li>
        </ul>
        <p>
          These providers may process information in Japan, Singapore, the United States, and
          other countries where they operate. We require service providers to protect personal
          information consistently with this policy and applicable law. We may also disclose
          information when legally required, to investigate abuse or security incidents, or as
          part of a business transfer subject to appropriate safeguards.
        </p>
      </section>

      <section>
        <h2>7. Retention</h2>
        <ul className="legal-list">
          <li><b>On-device information</b> remains until you delete it in the app, clear the app’s data, or remove the app, subject to your device backups.</li>
          <li><b>Cloud account content</b> is retained while your account is active so you can synchronize, restore, export, and receive reflections. A successful account deletion removes it from our active systems.</li>
          <li><b>OpenAI API content</b> may remain in abuse-monitoring logs for up to 30 days under the provider’s default controls, unless a different approved setting or law applies.</li>
          <li><b>Operational logs</b> are kept only for the limited period made available by our hosting providers and as needed to diagnose security or reliability incidents.</li>
          <li><b>Waitlist information</b> is kept until we send the requested launch updates, you ask us to remove it, or it is no longer needed for the waitlist. You can opt out or request deletion at any time.</li>
          <li><b>Deletion records</b> may retain a one-way account hash, request status, and timestamps so we can demonstrate and secure the deletion process. App stores and payment providers may retain transaction records under their own policies and legal obligations.</li>
        </ul>
        <p>
          Data removed from active systems may remain temporarily in encrypted provider backups
          until those backups rotate out. It is not restored to the live service except for
          disaster recovery, in which case completed deletions must be re-applied.
        </p>
      </section>

      <section>
        <h2>8. Your controls and rights</h2>
        <ul className="legal-list">
          <li>Choose on-device use, Wi-Fi-only backup, or Wi-Fi and cellular backup.</li>
          <li>Withdraw processing consent to stop future audio uploads and report processing. Withdrawal does not itself erase content already stored; use deletion for that.</li>
          <li>Export available account metadata, recordings, dates, and reports from Settings.</li>
          <li>Delete only this device’s data or delete the cloud account and associated data.</li>
          <li>Ask to access, correct, delete, restrict, or obtain a copy of personal information, or object where applicable.</li>
          <li>Ask us to remove your email from the launch waitlist at any time.</li>
        </ul>
        <p>
          Use Settings → Privacy in the app, visit the <a href="/delete-account">account-deletion page</a>,
          or email <a href="mailto:privacy@thirtynights.app">privacy@thirtynights.app</a>.
          We may verify your identity before acting on a request. Depending on where you live,
          you may complain to your local data-protection authority or appeal a denied request.
        </p>
      </section>

      <section>
        <h2>9. Legal bases for processing</h2>
        <p>
          Where a legal basis is required, we process account, synchronization, and purchase
          information to perform our contract with you; waitlist information and launch updates
          with your consent; recording audio and transcript material
          for AI-assisted reflections with your consent; limited technical information for our
          legitimate interests in security and reliability; and information as needed to meet
          legal obligations. You can withdraw consent prospectively at any time.
        </p>
      </section>

      <section>
        <h2>10. Security</h2>
        <p>
          We use transport encryption, provider encryption at rest, private storage buckets,
          short-lived signed download links, access controls, and server-side authorization.
          No system is perfectly secure. Protect your device and account credentials, and do
          not record information you are not comfortable storing or processing as described here.
        </p>
      </section>

      <section>
        <h2>11. Children</h2>
        <p>
          Thirty Nights is intended for adults and is not directed to children. You must be at
          least 18 years old, or the age of legal majority where you live, to create an account
          or use cloud processing. If you believe a child provided information, contact us so
          we can investigate and delete it.
        </p>
      </section>

      <section>
        <h2>12. Changes and contact</h2>
        <p>
          We may update this policy as the product or law changes. We will update the effective
          date and provide additional notice in the app when a material change affects your
          choices. Contact us at <a href="mailto:privacy@thirtynights.app">privacy@thirtynights.app</a> or through the <a href="/support">support page</a>.
        </p>
      </section>
    </LegalShell>
  );
}
