# Thirty Nights — Production Readiness Checklist (two-store)

> **Superseded for v1.** The launch is App Store only, and
> **[`docs/APP_STORE_LAUNCH.md`](APP_STORE_LAUNCH.md)** is the document to work
> from. Keep this one for the Android release: sections 1.3–1.4 (Play Console),
> 3 (Google Sign-In) and the Play halves of 5, 7 and 8 are the parts that are
> not covered there.

Last updated: 2026-08-11

Everything in this file needs a human: an account owner, a credential, a
physical device, or a design asset. Code-side work that could be done without
those is already done — see "Already fixed" at the bottom.

Work top to bottom. Later sections depend on earlier ones.

---

## 0. One command to run yourself

The `android/` folder is a **dev** prebuild (`applicationId com.thirtynights.app.dev`,
deep-link scheme `thirtynights-dev`). It is now gitignored, so EAS Build will no
longer upload it and will run `prebuild` itself — that part is fixed. The folder
is still on your disk though, ~1 GB, and will keep confusing local builds:

```bash
rm -rf android
```

Regenerate on demand with `npx expo prebuild --platform android --clean`.
Never commit the result.

**Why it mattered:** with native folders present in the upload, EAS ignores
`orientation`, `scheme`, `userInterfaceStyle`, `icon`, `backgroundColor`, `ios`,
`android` and `plugins` from `app.config.ts`. A production build would have
shipped with the dev package name and only a `thirtynights-dev://` intent
filter, so the production OAuth redirect would never have resolved and Google
sign-in would have hung forever on the callback.

---

## 1. Accounts and enrolments

| # | Task | Where | Blocks |
|---|---|---|---|
| 1.1 | Apple Developer Program enrolment; agreements, tax and banking accepted | developer.apple.com | Any iOS build |
| 1.2 | App Store Connect app record created for `com.thirtynights.app` | appstoreconnect.apple.com | iOS submit |
| 1.3 | Google Play Console enrolment + identity verification | play.google.com/console | Any Android release |
| 1.4 | Play app record created for `com.thirtynights.app` | Play Console | Android submit |
| 1.5 | Expo/EAS organisation, billing, project linked | expo.dev | All builds |

Then fill the two placeholders in `eas.json` → `submit.production.ios`:
`ascAppId` (numeric Apple ID from App Store Connect → App Information) and
`appleTeamId` (developer.apple.com → Membership). Neither is a secret.

---

## 2. Supabase

- [ ] **2.1** Production project created; note the project ref.
- [ ] **2.2** Run every committed migration against it in order. The newest
      entitlement/consent migration must ship together with the updated worker
      and client; it is not yet applied to the hosted project:
  ```bash
  npx supabase link --project-ref <ref>
  npx supabase db push
  ```
- [ ] **2.3** Verify RLS from a real client, not just that the SQL ran. In the
      SQL editor, `set role authenticated;` and confirm you cannot select
      another user's `nights` row.
- [ ] **2.4** Regenerate types and diff against `src/lib/database.types.ts`:
  ```bash
  npx supabase gen types typescript --project-id <ref> > /tmp/types.ts
  diff /tmp/types.ts src/lib/database.types.ts
  ```
- [ ] **2.5** Auth → URL Configuration → Redirect URLs, add **all three**:
  ```
  thirtynights://auth/callback
  thirtynights-staging://auth/callback
  thirtynights-dev://auth/callback
  ```
- [ ] **2.6** Auth → Providers → enable **Anonymous sign-ins** and
      **Manual linking**. The app's whole local-first model depends on both.
- [ ] **2.7** Custom SMTP configured (the built-in sender is rate-limited to a
      handful of mails an hour and will silently fail in beta).
- [ ] **2.8** CAPTCHA + rate limits enabled on auth endpoints.
- [ ] **2.8a** Enable Auth leaked-password protection; the hosted security
      advisor currently reports it disabled.
- [ ] **2.9** Point-in-time recovery / backups enabled.
- [x] **2.10** Deploy the Edge Functions (verified active 2026-08-10):
  ```bash
  npx supabase functions deploy revenuecat-webhook
  npx supabase functions deploy delete-account
  npx supabase functions deploy apple-identity
  ```
- [ ] **2.11** Set function secrets (never in Git):
  ```bash
  npx supabase secrets set \
    REVENUECAT_WEBHOOK_AUTH=<random 32+ chars> \
    REVENUECAT_WEBHOOK_HMAC_SECRET=<from RevenueCat> \
    REVENUECAT_SECRET_API_KEY=<RevenueCat secret key>
  ```

---

## 3. Google Sign-In — the full loop

This has never been exercised end to end. The client code is correct; the
provider config does not exist yet.

- [ ] **3.1** Google Cloud Console → APIs & Services → Credentials → Create
      OAuth client ID → **Web application** (yes, Web — Supabase brokers the
      exchange, the app never talks to Google directly).
- [ ] **3.2** Add the authorised redirect URI:
      `https://<project-ref>.supabase.co/auth/v1/callback`
- [ ] **3.3** Configure the OAuth consent screen: app name, support email, logo,
      privacy policy URL, terms URL. Publish it (in Testing mode only allow-listed
      Google accounts can sign in).
- [ ] **3.4** Supabase → Auth → Providers → Google → paste the client ID and
      secret → **Enable**.
- [ ] **3.5** Build a real device build and test all four paths:
  - new user → Continue with Google → account created
  - anonymous user with local recordings → Continue with Google → **same user ID
    preserved** (the app throws and refuses if it is not)
  - existing user → sign in on a second device → chapters restore
  - cancel the browser sheet halfway → app returns cleanly, no error toast

If Google is not enabled in Supabase, the app now shows the owner-setup
explanation instead of leaking `Unsupported provider: provider is not enabled`
into the UI. That is a safety net, not a substitute for doing the above.

**Optional UX upgrade:** browser-based OAuth opens a Safari/Custom Tab sheet
where the user retypes their Google password. Adding
`@react-native-google-signin/google-signin` gives the native account picker and
usually lifts Google conversion on iOS noticeably. Not required to ship.

---

## 4. Sign in with Apple — configuration and deletion verification

The revocation implementation is in `_shared/apple.ts`, `apple-identity`, and
`delete-account`, and both authenticated functions are deployed. Guideline
5.1.1(v) still blocks launch until the owner configures the Apple secrets and a
physical Apple-linked deletion proves that the refresh token is stored and
revoked before Supabase identity deletion.

To finish it I need from you:

- [ ] **4.1** Apple **Services ID** (the Sign in with Apple identifier)
- [ ] **4.2** Apple **Team ID**
- [ ] **4.3** A **Sign in with Apple private key** (`.p8`) + its Key ID, created
      at developer.apple.com → Keys. Put the key contents straight into
      `npx supabase secrets set APPLE_PRIVATE_KEY=...` — do not paste it into
      chat or commit it.

Once those exist as function secrets, redeploy the two authenticated functions
and exercise the signed physical-device deletion scenario. Do not mark this
gate complete from an unauthenticated 401 probe alone.

---

## 5. RevenueCat and products

- [ ] **5.1** RevenueCat project; iOS and Android apps connected with store
      credentials.
- [ ] **5.2** Create the two **non-consumable** products in both stores:
      `com.thirtynights.nights30`, `com.thirtynights.nights90`. They must be
      non-consumable, not subscriptions — the whole paywall says "nothing
      renews" and Apple will check.
- [ ] **5.3** Map both into a RevenueCat offering.
- [ ] **5.4** Enable webhook HMAC signing; point the webhook at the deployed
      `revenuecat-webhook` function; set the Authorization header to the same
      random value you used in 2.11.
- [ ] **5.5** Set Project → General → Restore behavior to **Transfer to new App
      User ID**. The server accepts a `TRANSFER` only when RevenueCat's alias
      arrays resolve to exactly one existing permanent Supabase UUID as the
      destination and at least one existing permanent source UUID that owns
      ledger rows. Ambiguous or anonymous-only transfers fail closed because
      the event does not contain enough transaction detail to reconstruct them;
      support must recover the original permanent account before retrying.
- [ ] **5.6** Set prices and territories in both stores.
- [ ] **5.7** Sandbox-test: purchase, restore on a second device, transfer
      between two test accounts, refund 90 while 30 remains granted, and
      confirm access flips only after the server grant lands (the client stays
      "server-verifying" by design).

---

## 6. Report worker

- [ ] **6.1** Dedicated OpenAI project with billing and a spend limit.
- [ ] **6.2** Confirm the two model IDs in `worker/.env.example` are available on
      your account — `gpt-4o-transcribe-diarize` and `gpt-5.6`. Adjust if not.
- [ ] **6.3** Railway is healthy on the prior worker image and `/healthz` is
      wired. Build and deploy the updated consent-enforcing container together
      with migration `20260810165730`; do not deploy either half alone.
- [ ] **6.4** Put `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
      `OPENAI_API_KEY` in the **host secret manager**, never in the image.
- [ ] **6.5** Set `WORKER_ALERT_WEBHOOK_URL` to the production HTTPS alert
      destination. Confirm `/healthz` reports `alertWebhookConfigured: true`,
      then verify the destination accepts the worker's `firing` and `resolved`
      JSON payloads. Defaults alert on jobs overdue by 45 minutes, retrying jobs
      that reach three attempts within one hour, or any finally failed job,
      with a 30-minute reminder cooldown.
- [ ] **6.6** End-to-end test: seal 7 nights, confirm the mini report generates,
      the clips render, and audio plays back in the app.

---

## 7. Legal pages and store declarations

- [ ] **7.1** Publish four HTTPS pages and put their URLs in the EAS production
      environment. The app **refuses to build for production** with placeholder
      or non-HTTPS values, by design:
      `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`,
      `EXPO_PUBLIC_SUPPORT_URL`, `EXPO_PUBLIC_DELETE_ACCOUNT_URL`.
- [ ] **7.2** The privacy policy must state, explicitly: what is collected (voice
      recordings, email, purchase history, device timezone), that recordings are
      sent to a third-party model provider for transcription and reflection, the
      retention period, and how to request deletion.
- [ ] **7.3** Play Console → **Data safety** form. Declare: Audio (voice
      recordings), Personal info (email), Financial info (purchase history).
      Mark encrypted in transit and deletable on request.
- [ ] **7.4** App Store Connect → **App Privacy** nutrition labels, same set.
- [ ] **7.5** Play Console → the web account-deletion URL from 7.1 goes in the
      Data safety section too. Play requires an off-app deletion route.
- [ ] **7.6** Set all EAS production environment variables:
  ```bash
  eas env:create --environment production --name EXPO_PUBLIC_APP_ENV --value production
  # ...and each of the ten in app.config.ts assertProductionConfiguration()
  ```

---

## 8. Store listing assets

None of these exist yet. `screenshots/` holds emulator dev captures, not sized
store assets.

- [ ] **8.1** iOS screenshots: 6.9" (1320×2868) and 6.5" (1242×2688), 3–10 each.
- [ ] **8.2** Android phone screenshots: min 2, 1080×1920 or larger.
- [ ] **8.3** Play feature graphic: 1024×500, no transparency.
- [ ] **8.4** Play app icon: 512×512 PNG.
- [ ] **8.5** Descriptions, keywords, category (Health & Fitness or Lifestyle),
      content rating questionnaire, and an age rating.
- [ ] **8.6** App Review notes: give the reviewer a demo account and explain that
      the app is intentionally one-question-per-night so they do not think it is
      broken when night 2 will not open.

---

## 9. Observability — needs one credential from you

- [ ] **9.1** Create a Sentry project (React Native), get the DSN.
- [ ] **9.2** Give me the DSN and I will wire `@sentry/react-native`, hook it to
      the existing `ErrorBoundary` (which currently `console.error`s into the
      void in production), and scrub recording paths and email from events.
- [x] **9.3** A privacy-safe, provider-neutral funnel event layer is implemented
      and unit tested. It rejects recording/question/report text, email,
      content identifiers, unknown fields, and unbounded free-form values.
- [ ] **9.4** Choose and connect a production analytics destination, document it
      in 7.3/7.4, and verify the destination receives only the allowlisted
      payloads. Until then events remain intentionally on-device/in-process.

---

## 10. Before you press submit

- [x] **10.1** `npm run check` green (typecheck + 102 tests + worker + web export),
      verified 2026-08-11 on this worktree.
- [x] **10.2** `npm run doctor` 20/20, verified 2026-08-11.
- [ ] **10.3** `npm run audit:release` clean at high/critical.
- [ ] **10.4** Run the full journey on a **physical** iPhone and Android phone:
      two-page onboarding → reminder/notification choice → record → seal →
      reward → 7 nights → report → paywall → purchase → restore.
- [ ] **10.5** Test with the system font size at maximum and with
      "Reduce Motion" on.
- [ ] **10.6** Airplane-mode test: record a night offline, confirm it is kept and
      syncs when the network returns.
- [ ] **10.7** Kill the app mid-recording; confirm nothing is corrupted.
- [ ] **10.8** Confirm the reviewer can find Privacy, Terms and Delete Account
      inside Settings without an account.

---

## Already fixed (no action needed)

- `android/` gitignored so EAS runs prebuild and honours `app.config.ts`
  (this was the highest-severity issue; doctor now passes 20/20).
- `.env` untracked and gitignored; `tmp/`, `.impeccable/`, `ios/` ignored too.
- `ITSAppUsesNonExemptEncryption: false` declared — uploads no longer stall on
  the export-compliance question.
- `supportsTablet: false` — matches the documented v1 phone-only decision;
  previously App Review would have tested on iPad.
- Android notification icon generated as a proper white-on-transparent mask
  (`assets/app/notification-icon.png`, regenerate with
  `python scripts/make_notification_icon.py`) and tinted brass. It was rendering
  as a grey blob.
- `ProviderUnavailableError` — a disabled OAuth provider now routes to the
  owner-setup explanation instead of leaking a raw Supabase string.
- `WebBrowser.maybeCompleteAuthSession()` added for the web target.
- Store prices now load without an account. They previously required
  `authState === 'authenticated'`, so a first-time viewer saw "Account required"
  and no price — a conversion hole and a review risk.
- Worker: deadlines on every upstream call (`storage`/`transcription`/`analysis`),
  a `GET /healthz` liveness endpoint, a Docker `HEALTHCHECK`, and consecutive
  failure tracking. A hung provider used to hold a job lease for 30 minutes.
- `eas.json` submit block scaffolded for both stores.
- Expo SDK patch drift resolved (`expo` 57.0.12, `expo-auth-session` 57.0.6).
