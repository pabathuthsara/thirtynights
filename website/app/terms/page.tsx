import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

const title = "Terms & Conditions — Thirty Nights";
const description = "The terms that apply when you use the Thirty Nights app, website, cloud backup, and reflection features.";

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
      title="Simple terms for a personal reflection service."
      intro="These terms explain the rules for using Thirty Nights, your rights in your recordings, purchases, and the limits of an AI-assisted reflection tool."
    >
      <p className="legal-date">Effective August 20, 2026</p>

      <section>
        <h2>1. Agreement and eligibility</h2>
        <p>
          These Terms are an agreement between you and Thirty Nights (“Thirty Nights,” “we,”
          “us,” or “our”), operated from Sri Lanka. By downloading, accessing, or using the
          app, website, cloud backup, or reflection service, you agree to these Terms and our
          <a href="/privacy"> Privacy Policy</a>. You must be at least 18 years old, or the age
          of legal majority where you live, and legally able to enter this agreement.
        </p>
      </section>

      <section>
        <h2>2. The service</h2>
        <p>
          Thirty Nights provides scheduled journaling prompts, local voice recording, optional
          account-based synchronization and backup, optional AI-assisted transcription and
          reflections, export tools, and purchase-based access to longer journeys. Features may
          vary by platform, country, device, or app version. You are responsible for your device,
          internet access, account credentials, and the accuracy of information you provide.
        </p>
      </section>

      <section>
        <h2>3. Accounts and deletion</h2>
        <p>
          You may begin locally and may use a guest or permanent account where offered. Do not
          share credentials or access another person’s account. You are responsible for activity
          under your account unless you promptly report unauthorized use. You can delete your
          account in Settings or follow our <a href="/delete-account">web deletion instructions</a>.
        </p>
      </section>

      <section>
        <h2>4. Your content and the permission you give us</h2>
        <p>
          You retain ownership of recordings, transcripts, and other content you create. When
          you enable cloud or reflection features, you give us a limited, worldwide, non-exclusive
          license to host, copy, transmit, transcribe, analyze, format, and return that content
          only as needed to provide and secure the service you
          requested. This license ends when the content is deleted from our active systems,
          subject to limited backup, security, and legal retention described in the Privacy Policy.
          You confirm that you have the right to submit the content and that doing so does not
          violate another person’s privacy, confidentiality, or intellectual-property rights.
        </p>
      </section>

      <section>
        <h2>5. AI-assisted reflections and wellbeing</h2>
        <p>
          Transcripts and reflections are generated with automated systems and may be incomplete,
          inaccurate, or unsuitable for your situation. Review them critically and do not rely on
          them as facts or professional advice. Thirty Nights is a journaling and reflection tool,
          not medical care, mental-health treatment, therapy, diagnosis, legal or financial advice,
          or an emergency service. If you may harm yourself or someone else, contact local emergency
          services or a qualified crisis resource immediately.
        </p>
      </section>

      <section>
        <h2>6. Purchases and refunds</h2>
        <p>
          The first seven nights are offered without an in-app purchase. Longer journeys may be
          available as one-time, non-renewing in-app purchases; they are not subscriptions unless
          the store screen expressly says otherwise. Prices, taxes, currencies, and available plans
          appear in the Apple App Store or Google Play before you confirm payment. The applicable
          store processes the payment and controls its refund process. Statutory refund and consumer
          rights remain unaffected. Deleting an account does not automatically cancel or refund a
          completed purchase, and store transaction records may remain with Apple or Google.
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You must not:</p>
        <ul className="legal-list">
          <li>access, attempt to access, or disclose another person’s account or content;</li>
          <li>upload unlawful content or recordings made without required permission;</li>
          <li>probe, bypass, disable, or interfere with authentication, security, time locks, purchases, storage limits, or service operation;</li>
          <li>introduce malware, automate abusive requests, reverse engineer protected portions of the service except where law expressly permits, or use the service to violate law; or</li>
          <li>resell, impersonate, misrepresent affiliation with, or exploit Thirty Nights or its content without permission.</li>
        </ul>
      </section>

      <section>
        <h2>8. Our intellectual property</h2>
        <p>
          The service, prompts, visual design, artwork, software, trademarks, and other materials
          we provide are owned by us or our licensors and protected by applicable law. These Terms
          grant you a personal, limited, non-exclusive, non-transferable, revocable right to use the
          service for its intended purpose. They do not transfer ownership of our materials to you.
        </p>
      </section>

      <section>
        <h2>9. Availability, changes, and termination</h2>
        <p>
          We aim to keep Thirty Nights available, but offline devices, app stores, networks, model
          providers, and hosting services can fail. Keep exports of content you cannot afford to lose.
          We may repair, update, suspend, or discontinue features and may terminate access for a
          serious or repeated breach of these Terms, security risk, legal requirement, or service
          shutdown. Where reasonably possible, we will provide notice and an opportunity to export
          content. You may stop using the service and delete your account at any time.
        </p>
      </section>

      <section>
        <h2>10. Disclaimers</h2>
        <p>
          To the fullest extent permitted by law, the service is provided “as is” and “as available.”
          We disclaim implied warranties of merchantability, fitness for a particular purpose,
          non-infringement, uninterrupted availability, and error-free or perfectly accurate output.
          Nothing in these Terms excludes a warranty or consumer right that cannot lawfully be excluded.
        </p>
      </section>

      <section>
        <h2>11. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Thirty Nights is not liable for indirect, incidental,
          special, consequential, or punitive loss, or loss of data, revenue, profits, goodwill, or
          opportunity arising from the service. Our total liability for claims relating to the service
          will not exceed the amount you paid for Thirty Nights during the 12 months before the event
          giving rise to the claim. These limits do not apply where liability cannot be limited by law,
          including liability for fraud, willful misconduct, or death or personal injury caused by negligence.
        </p>
      </section>

      <section>
        <h2>12. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of Sri Lanka, without regard to conflict-of-law rules.
          Courts with jurisdiction in Sri Lanka may hear disputes, but this does not deprive you of
          mandatory consumer protections or a right to bring a claim in another forum where applicable
          law requires it. Before filing a claim, please contact us and allow 30 days to try to resolve it informally.
        </p>
      </section>

      <section>
        <h2>13. Changes and general terms</h2>
        <p>
          We may update these Terms as the service or law changes. Material changes will be communicated
          through the app or service and will apply prospectively from the stated effective date. If one
          provision is unenforceable, the remaining provisions continue. A failure to enforce a provision
          is not a waiver. You may not transfer this agreement without our consent; we may transfer it as
          part of a reorganization or sale, subject to applicable law.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          Questions about these Terms can be sent to <a href="mailto:privacy@thirtynights.app">privacy@thirtynights.app</a> or through our <a href="/support">support page</a>.
        </p>
      </section>
    </LegalShell>
  );
}
