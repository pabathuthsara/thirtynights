import Image from "next/image";
import { WaitlistButton } from "./waitlist-button";

const stickerTrail = [
  "/stickers/night-01.png",
  "/stickers/night-02.png",
  "/stickers/night-03.png",
  "/stickers/night-07.png",
  "/stickers/night-14.png",
  "/stickers/night-22.png",
  "/stickers/night-30.png",
];

function Sparkle({ small = false }: { small?: boolean }) {
  return <span className={small ? "sparkle sparkle-small" : "sparkle"} aria-hidden="true">✦</span>;
}

function PhonePreview() {
  return (
    <div className="phone-scene" aria-label="Thirty Nights app preview">
      <Image className="hero-flowers" src="/keepsake/dried-flowers.png" alt="" width={310} height={310} priority />
      <div className="phone">
        <div className="phone-speaker" />
        <div className="phone-screen">
          <div className="app-topline"><Sparkle small /> NIGHT 7 OF 30 <Sparkle small /></div>
          <h2>August</h2>
          <p className="kept"><Sparkle small /> 7 nights kept</p>
          <div className="sticker-focus">
            <Image src="/stickers/night-07.png" alt="A collectible night seven sticker" width={220} height={220} priority />
          </div>
          <div className="question-card">
            <Image className="card-seal" src="/keepsake/wax-seal.png" alt="" width={66} height={66} />
            <span>TONIGHT&apos;S QUESTION</span>
            <p>What are you finally ready to name plainly?</p>
            <b>Open tonight&apos;s letter →</b>
          </div>
        </div>
      </div>
      <Image className="hero-journal" src="/keepsake/journal.png" alt="" width={260} height={260} priority />
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "section-heading section-heading-centered" : "section-heading"}>
      <p className="eyebrow"><Sparkle /> {eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="Primary navigation">
        {/* A full document navigation keeps the brand link reliable on every deployment target. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/" aria-label="Thirty Nights home">
          <Image src="/icon.png" alt="" width={38} height={38} priority />
          <span>Thirty Nights</span>
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
          <WaitlistButton compact />
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><Sparkle /> ONE QUESTION · ONE NIGHT AT A TIME</p>
          <h1>Hear what your life has been trying to tell you.</h1>
          <p className="hero-lede">
            Answer one thoughtful question in your own voice each night.
            Seal it, let time pass, then return to the patterns.
          </p>
          <div className="hero-actions">
            <WaitlistButton />
            <span className="availability">Coming soon on iOS &amp; Android · Your first 7 nights are free</span>
          </div>
          <div className="privacy-note">
            <span aria-hidden="true">◇</span>
            Your recording audio stays on your phone until you choose secure backup and processing.
          </div>
        </div>
        <PhonePreview />
      </section>

      <section className="promise-strip" aria-label="Thirty Nights at a glance">
        <div className="shell promise-grid">
          <p><b>01</b><span>One thoughtful question</span></p>
          <p><b>02</b><span>One unedited voice take</span></p>
          <p><b>03</b><span>A reflection worth returning to</span></p>
        </div>
      </section>

      <section className="section shell" id="how-it-works">
        <SectionHeading
          centered
          eyebrow="A SMALL NIGHTLY RITUAL"
          title="Speak. Seal. Return."
          body="No blank journal page. No performance. Just one question and the voice you had that night."
        />
        <div className="steps">
          <article className="step-card">
            <span className="step-number">01</span>
            <div className="ritual-visual mic-visual" aria-hidden="true">
              <div className="wave-lines">
                {[14, 28, 43, 60, 38, 52, 24, 44, 18].map((height, index) => (
                  <i key={index} style={{ height }} />
                ))}
              </div>
              <div className="mic-dot">●</div>
            </div>
            <h3>Answer in your voice</h3>
            <p>Open one question and speak honestly. One take keeps it human.</p>
          </article>
          <article className="step-card step-card-featured">
            <span className="step-number">02</span>
            <div className="ritual-visual seal-visual">
              <Image src="/keepsake/wax-seal.png" alt="" width={170} height={170} />
            </div>
            <h3>Seal the night</h3>
            <p>Your answer stays closed until a reflection checkpoint. No replaying or polishing.</p>
          </article>
          <article className="step-card">
            <span className="step-number">03</span>
            <div className="ritual-visual reflection-visual" aria-hidden="true">
              <span>THE ARC</span>
              <strong>You started saying the quiet part out loud.</strong>
              <i />
              <i />
            </div>
            <h3>Hear the pattern</h3>
            <p>Return to a private reflection shaped by the nights you actually kept.</p>
          </article>
        </div>
      </section>

      <section className="chapter-section">
        <div className="shell chapter-layout">
          <div className="chapter-copy">
            <SectionHeading
              eyebrow="YOUR FIRST SEVEN ARE FREE"
              title="Start small. Keep what matters."
              body="Night seven brings your first reflection. If it feels meaningful, one payment continues the same chapter through night thirty."
            />
            <ul className="check-list">
              <li><span>✓</span> No card required to begin</li>
              <li><span>✓</span> One gentle reminder at your chosen time</li>
              <li><span>✓</span> No subscription and nothing renews</li>
            </ul>
            <WaitlistButton />
          </div>
          <div className="sticker-sheet">
            <Image className="sheet-tape" src="/keepsake/washi-tape.png" alt="" width={150} height={150} />
            <p className="sheet-label">YOUR NIGHTS, KEPT</p>
            <div className="sticker-grid">
              {stickerTrail.map((src, index) => (
                <div className="sticker-cell" key={src}>
                  <Image src={src} alt={`Collectible sticker for night ${[1, 2, 3, 7, 14, 22, 30][index]}`} width={132} height={132} />
                  <span>NIGHT {[1, 2, 3, 7, 14, 22, 30][index]}</span>
                </div>
              ))}
              <div className="sticker-cell sticker-cell-empty" aria-hidden="true">
                <span>…AND EVERY NIGHT BETWEEN</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="night-section" id="privacy">
        <div className="shell privacy-layout">
          <div className="privacy-art" aria-hidden="true">
            <div className="moon-orbit orbit-one" />
            <div className="moon-orbit orbit-two" />
            <Image src="/icon.png" alt="" width={290} height={290} />
            <Sparkle />
          </div>
          <div className="privacy-copy">
            <p className="night-eyebrow"><Sparkle /> PRIVATE BY DESIGN</p>
            <h2>Your voice belongs to you.</h2>
            <p className="privacy-lede">
              Recording begins locally. Your voice does not leave your phone until you choose backup and reflection processing.
            </p>
            <div className="privacy-points">
              <article>
                <b>Local first</b>
                <p>New recordings are saved on your device before anything else.</p>
              </article>
              <article>
                <b>Clear permission</b>
                <p>Backup and AI-assisted reflection processing require an explicit choice.</p>
              </article>
              <article>
                <b>Leave with everything</b>
                <p>Export your archive or delete your account and stored recordings.</p>
              </article>
            </div>
            <a className="paper-link" href="/privacy">Read the privacy policy →</a>
          </div>
        </div>
      </section>

      <section className="section shell reflection-section">
        <div className="reflection-copy">
          <SectionHeading
            eyebrow="A REFLECTION, NOT A SCORE"
            title="Your month, returned in your own words."
            body="Thirty Nights looks for the ideas, tensions, and changes that repeated across your recordings—then links them back to the moments you spoke."
          />
          <div className="feature-list">
            <p><span>✦</span><b>Private written reflections</b><small>Built only from your recorded nights</small></p>
            <p><span>✦</span><b>Playable moments</b><small>Hear the exact voice note behind an insight</small></p>
            <p><span>✦</span><b>A complete export</b><small>Keep your recordings, dates, and reflections</small></p>
          </div>
        </div>
        <div className="report-preview">
          <Image className="report-flowers" src="/keepsake/dried-flowers.png" alt="" width={170} height={170} />
          <p className="report-kicker">WHAT KEPT RETURNING</p>
          <h3>You made more room for what felt easy.</h3>
          <p className="report-body">
            The nights you called good were rarely the most productive. They were the ones where you stopped measuring the day.
          </p>
          <blockquote>
            <Image src="/keepsake/wax-seal.png" alt="" width={58} height={58} />
            <div>
              <p>“Nothing happened, really. It was just easy for once.”</p>
              <cite>Night 19 · tap the wax to listen</cite>
            </div>
          </blockquote>
          <div className="report-rule" />
          <p className="report-arc">THE ARC</p>
          <strong>You spent the month telling yourself the truth in smaller sentences.</strong>
        </div>
      </section>

      <section className="download-section" id="download">
        <div className="shell download-card">
          <Image className="download-journal" src="/keepsake/journal.png" alt="" width={310} height={310} />
          <Image className="download-seal" src="/keepsake/wax-seal.png" alt="" width={100} height={100} />
          <div>
            <p className="eyebrow"><Sparkle /> YOUR FIRST SEVEN NIGHTS ARE FREE</p>
            <h2>Tonight&apos;s question is waiting.</h2>
            <p>Coming soon to iOS and Android. Join the founding waitlist for launch news.</p>
            <WaitlistButton />
          </div>
        </div>
      </section>

      <section className="section shell faq-section" id="faq">
        <SectionHeading centered eyebrow="THE SMALL PRINT" title="A few honest answers." />
        <div className="faq-list">
          <details>
            <summary>Can I replay a recording right away?<span>+</span></summary>
            <p>No. Each take stays sealed until its reflection checkpoint, so you can speak without editing yourself afterward.</p>
          </details>
          <details>
            <summary>Is this a subscription?<span>+</span></summary>
            <p>No. Your first seven nights are included. Continuing through night thirty is a one-time purchase.</p>
          </details>
          <details>
            <summary>Do I have to answer at the reminder time?<span>+</span></summary>
            <p>No. The reminder is only a nudge; the question remains available throughout its scheduled day.</p>
          </details>
          <details>
            <summary>Does my audio automatically go to the cloud?<span>+</span></summary>
            <p>No. Recordings begin on your device. Backup and reflection processing are choices you make separately.</p>
          </details>
          <details>
            <summary>Can I export or delete my data?<span>+</span></summary>
            <p>Yes. The app includes export and deletion controls, and the web deletion page works even if you cannot open the app.</p>
          </details>
        </div>
      </section>

      <footer>
        <div className="shell footer-grid">
          <div className="footer-brand">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="brand" href="/" aria-label="Thirty Nights home">
              <Image src="/icon.png" alt="" width={38} height={38} />
              <span>Thirty Nights</span>
            </a>
            <p>One question. One voice. Thirty nights.</p>
          </div>
          <div className="footer-links">
            <div>
              <b>Explore</b>
              <a href="#how-it-works">How it works</a>
              <a href="#privacy">Privacy</a>
              <a href="#faq">FAQ</a>
            </div>
            <div>
              <b>Legal &amp; support</b>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms">Terms &amp; conditions</a>
              <a href="/support">Support</a>
              <a href="/delete-account">Account deletion</a>
            </div>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© {new Date().getFullYear()} Thirty Nights</span>
          <span>Made for quieter evenings.</span>
        </div>
      </footer>
    </main>
  );
}
