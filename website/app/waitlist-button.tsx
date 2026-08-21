"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const waitlistEndpoint =
  "https://hnlanyoyktxpllgxgorz.supabase.co/functions/v1/waitlist-signup";

type WaitlistButtonProps = {
  compact?: boolean;
};

export function WaitlistButton({ compact = false }: WaitlistButtonProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const titleId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => emailRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openDialog() {
    setStatus("idle");
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(waitlistEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          platform: form.get("platform"),
          company: form.get("company"),
        }),
      });

      if (!response.ok) throw new Error("signup_failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        className={compact ? "nav-download waitlist-nav-button" : "waitlist-button"}
        onClick={openDialog}
      >
        {compact ? (
          "Join the waitlist"
        ) : (
          <>
            <span className="waitlist-spark" aria-hidden="true">✦</span>
            <span>
              <small>COMING SOON</small>
              <strong>Join the waitlist</strong>
            </span>
          </>
        )}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="waitlist-backdrop"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) closeDialog();
              }}
            >
              <section className="waitlist-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <button
                  ref={closeRef}
                  className="waitlist-close"
                  type="button"
                  aria-label="Close waitlist form"
                  onClick={closeDialog}
                >
                  ×
                </button>

                {status === "success" ? (
                  <div className="waitlist-success" aria-live="polite">
                    <span aria-hidden="true">✦</span>
                    <p className="waitlist-kicker">YOU&apos;RE ON THE LIST</p>
                    <h2 id={titleId}>We&apos;ll meet you at night one.</h2>
                    <p>We&apos;ll email you when Thirty Nights opens on iOS and Android.</p>
                    <button type="button" className="waitlist-submit" onClick={closeDialog}>Back to the page</button>
                  </div>
                ) : (
                  <>
                    <p className="waitlist-kicker">FOUNDING WAITLIST</p>
                    <h2 id={titleId}>Be there for night one.</h2>
                    <p className="waitlist-intro">
                      Thirty Nights is coming soon to iOS and Android. Join for launch news and start with your first seven nights free.
                    </p>

                    <form className="waitlist-form" onSubmit={submit}>
                      <label htmlFor={`${titleId}-email`}>Email address</label>
                      <input
                        ref={emailRef}
                        id={`${titleId}-email`}
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        maxLength={254}
                        required
                      />

                      <fieldset>
                        <legend>Tell me about</legend>
                        <div className="platform-options">
                          <label><input type="radio" name="platform" value="both" defaultChecked /><span>Both</span></label>
                          <label><input type="radio" name="platform" value="ios" /><span>iOS</span></label>
                          <label><input type="radio" name="platform" value="android" /><span>Android</span></label>
                        </div>
                      </fieldset>

                      <div className="waitlist-honeypot" aria-hidden="true">
                        <label htmlFor={`${titleId}-company`}>Company</label>
                        <input id={`${titleId}-company`} name="company" type="text" tabIndex={-1} autoComplete="off" />
                      </div>

                      <button className="waitlist-submit" type="submit" disabled={status === "submitting"}>
                        {status === "submitting" ? "Saving your place…" : "Save my place"}
                      </button>
                      {status === "error" ? (
                        <p className="waitlist-error" role="alert">We couldn&apos;t save your place. Please try again.</p>
                      ) : null}
                      <p className="waitlist-fineprint">
                        Launch updates only—no spam. By joining, you agree to our <a href="/privacy">Privacy Policy</a>.
                      </p>
                    </form>
                  </>
                )}
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
