import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

const title = "Delete Your Account — Thirty Nights";
const description = "Local placeholder instructions for deleting a Thirty Nights account and recordings.";

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
      intro="The app already includes deletion controls. This local page reserves the future web-request route required for people who cannot open the app."
    >
      <p className="legal-date">Local placeholder · no web form is connected yet</p>

      <section>
        <h2>Delete from the app</h2>
        <ol className="delete-steps">
          <li><span>1</span><p>Open <b>Thirty Nights</b> and go to <b>Settings</b>.</p></li>
          <li><span>2</span><p>Under <b>Privacy</b>, choose <b>Delete everything</b>.</p></li>
          <li><span>3</span><p>Select whether to remove this device only or the connected cloud account too.</p></li>
          <li><span>4</span><p>Review the warning and confirm the permanent deletion.</p></li>
        </ol>
      </section>

      <section className="request-placeholder">
        <p className="eyebrow">WEB REQUEST PLACEHOLDER</p>
        <h2>Cannot open the app?</h2>
        <p>
          Before launch, this area will connect to an authenticated deletion request flow.
          Supabase is intentionally not connected for the local marketing draft.
        </p>
        <a className="store-button request-button" href="mailto:privacy@thirtynights.app?subject=Thirty%20Nights%20account%20deletion">
          Email a deletion request
        </a>
        <small>Placeholder address: privacy@thirtynights.app</small>
      </section>

      <section>
        <h2>What deletion covers</h2>
        <p>
          The final production flow is intended to remove the selected account data,
          recordings, transcripts, and reports. Store purchase records controlled by Google
          Play are not erased by deleting the app account.
        </p>
      </section>
    </LegalShell>
  );
}
