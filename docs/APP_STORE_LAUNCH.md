# Thirty Nights — App Store Launch Guide (iOS only)

Last updated: 2026-08-06

This is the authoritative document for the v1 launch. It supersedes
`docs/PRODUCTION_CHECKLIST.md`, which covered a two-store launch; keep that file
for when Android comes later.

**Scope decision:** v1 ships to the Apple App Store only. Google Sign-In has
been removed from the UI. Sign-in is Apple + email link.

Estimated calendar time: **2–3 weeks**, most of it waiting on Apple
(enrolment, banking, review). Estimated hands-on time: 2–3 days.

---

## Part 0 — What changed in the code today

Done, no action needed:

| Change | File | Why |
|---|---|---|
| Google Sign-In button removed | `src/screens/AuthScreen.tsx` | iOS-only launch; no Google Cloud OAuth client to configure, no consent screen to publish, one fewer provider to test |
| Production builds no longer demand a Play RevenueCat key | `app.config.ts` | It required `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, which would have blocked the iOS build on a credential you have no reason to own yet. Now keyed off `EAS_BUILD_PLATFORM` |
| Deletion copy says "the App Store", not "Apple or Google" | `src/screens/SettingsScreen.tsx` | Reviewer-facing accuracy |
| **Apple token revocation implemented** | 3 new files, see below | This was the one guaranteed rejection |

The Google code path in `src/lib/supabase.ts` is untouched and still works. Only
the button is gone, so re-enabling it for the Android release is a one-line
change, not a rebuild.

### The Apple revocation work

Guideline 5.1.1(v) requires that deleting an account also revokes the tokens
Apple issued. Deleting only our own records is a rejection. Apple's revoke
endpoint needs a refresh token, and a refresh token only exists if the
single-use authorization code from sign-in was exchanged within minutes — so
this had to be built in two halves:

```
sign-in  → device gets authorizationCode
         → POST /functions/v1/apple-identity
         → exchange with Apple for refresh_token
         → store_apple_refresh_token()  →  private.apple_identities

deletion → get_apple_refresh_token()
         → POST https://appleid.apple.com/auth/revoke
         → then, and only then, delete storage + user
           (the token row goes with it, by cascade)
```

New files:

- `supabase/functions/_shared/apple.ts` — ES256 client-secret JWT signing via
  WebCrypto, code exchange, revocation
- `supabase/functions/apple-identity/index.ts` — captures the token at sign-in
- `supabase/migrations/20260806120000_apple_token_revocation.sql` — the
  `private.apple_identities` table plus two service-role-only RPCs

Modified: `supabase/functions/delete-account/index.ts` revokes before deleting;
`src/lib/supabase.ts` posts the code after both Apple sign-in paths.

**Two properties worth knowing.** Capturing the token is non-fatal — a failed
exchange never blocks sign-in, it only means that account has nothing to revoke.
Revoking is fatal — if it fails, deletion aborts while it is still retryable
rather than leaving an orphan Apple grant behind.

**This code has never run against Apple.** It cannot until the credentials in
Part 3 exist. Test it on a real device before you submit.

> **Alternative worth considering:** with Google gone, you now offer no
> third-party login at all, so guideline 4.8 no longer *requires* Sign in with
> Apple — email link alone would satisfy it, and all of the above becomes
> unnecessary. I kept Apple because it measurably lifts iOS sign-in conversion
> and the work is done. If you would rather cut scope, deleting the Apple button
> removes Part 3 entirely.

---

## Part 1 — What is actually missing

Nothing in this table is a code defect. Every one needs an account, a
credential, a device, or a design asset.

### Backend

| Gap | Severity | Blocks |
|---|---|---|
| No production Supabase project | **Blocker** | Everything |
| Migrations never run against a hosted project | **Blocker** | Everything |
| Edge Functions never deployed (3 of them now) | **Blocker** | Purchases, deletion, Apple |
| Apple provider not enabled in Supabase | **Blocker** | Apple sign-in |
| No Apple server-to-server credentials | **Blocker** | Account deletion → rejection |
| No RevenueCat project or SDK key | **Blocker** | Any purchase |
| IAP products do not exist in App Store Connect | **Blocker** | Any purchase |
| Report worker not deployed anywhere | **Blocker** | Reports never generate |
| No OpenAI project or key | **Blocker** | Reports never generate |
| Custom SMTP not configured | **High** | Email links silently rate-limit in beta |
| No error reporting (Sentry) | **High** | Crashes are invisible |
| PITR / backups not enabled | **High** | Data loss is unrecoverable |
| No alerting on failed report jobs | **Medium** | A dead worker looks like "reports are slow" |
| No product analytics | **Medium** | Onboarding and paywall cannot be evaluated |

### Frontend

| Gap | Severity | Blocks |
|---|---|---|
| Legal URLs are placeholders | **Blocker** | Production build refuses to compile, by design |
| No store screenshots at required sizes | **Blocker** | Submission |
| No App Store description, keywords, category | **Blocker** | Submission |
| App Privacy nutrition labels not filled | **Blocker** | Submission |
| Never run on a physical iPhone | **Blocker** | Unknown unknowns |
| Age rating questionnaire not answered | **Blocker** | Submission |
| No large-text / Reduce Motion pass | **Medium** | Accessibility rejections, bad reviews |
| `android/` folder still on disk (~1 GB) | **Low** | Nothing — gitignored. Disk hygiene only |

The app itself — recording, sealing, the 90 questions, onboarding, paywall,
Gallery, Light Map, Settings, export, deletion — is built and passing its
tests. What is missing is the infrastructure it talks to and the paperwork
around it.

---

## Part 2 — Apple accounts (start today, it gates everything)

Apple's enrolment and banking steps have multi-day waits. Start them before
touching anything technical.

**2.1** Enrol in the Apple Developer Program — $99/year, developer.apple.com.
Individual is fine; an Organization needs a D-U-N-S number and takes longer.

**2.2** App Store Connect → Agreements, Tax, and Banking. Accept the Paid
Applications agreement and complete tax + banking forms. **Purchases cannot be
tested in sandbox until this shows Active.** This is the step people forget and
then lose a week to.

**2.3** Create the app record: App Store Connect → Apps → New App.
- Platform: iOS
- Bundle ID: `com.thirtynights.app` (register it first at developer.apple.com →
  Identifiers, with **Sign in with Apple** and **In-App Purchase** capabilities
  enabled)
- SKU: anything, e.g. `thirtynights-ios-v1`
- Primary language: English

**2.4** Note two values and put them in `eas.json` → `submit.production.ios`,
replacing the placeholders:
- `ascAppId` — the numeric Apple ID under App Information
- `appleTeamId` — developer.apple.com → Membership

Neither is secret. The App Store Connect API key *is* — that goes into EAS
credentials, never into the repo.

**2.5** Create an Expo/EAS account, link the project, and confirm billing at
expo.dev.

---

## Part 3 — Apple Sign-In credentials

**3.1** developer.apple.com → Identifiers → your App ID → confirm **Sign in with
Apple** is enabled.

**3.2** Keys → **+** → name it "Thirty Nights Sign in with Apple" → tick Sign in
with Apple → configure it against your primary App ID → Continue → Register.

**3.3** Download the `.p8` file. **You get exactly one download.** Store it in a
password manager. Note the **Key ID** shown next to it.

**3.4** Note your **Team ID** (Membership page).

**3.5** Supabase → Authentication → Providers → Apple → Enable. For native iOS
sign-in you only need the bundle ID in the authorized client IDs field:
`com.thirtynights.app`. No Services ID, no secret key here — the native flow
sends an identity token that Supabase validates directly.

**3.6** Set the function secrets (Part 4 covers the Supabase project itself):

```bash
npx supabase secrets set APPLE_TEAM_ID=<your team id> APPLE_KEY_ID=<the key id from 3.3> APPLE_CLIENT_ID=com.thirtynights.app
```

For `APPLE_PRIVATE_KEY`, use the dashboard rather than the CLI: **Project
Settings → Edge Functions → Secrets → Add new secret**, and paste the entire
`.p8` file including the `-----BEGIN PRIVATE KEY-----` and `-----END-----`
lines. Multi-line values through a shell are where this goes wrong. The helper
accepts both real newlines and the literal `\n` some secret stores substitute,
so either survives.

`APPLE_CLIENT_ID` is the **bundle identifier**, not a Services ID. Services IDs
belong to the web redirect flow; using one here makes Apple answer
`invalid_client`, and that error surfaces only at deletion time.

Paste the `.p8` contents straight into the secret manager. Never into chat, the
repo, `.env`, or a screenshot.

---

## Part 4 — Supabase

**4.1** Create the production project. Pick the region closest to your users.
Note the project ref.

**4.2** Run all five migrations:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

**4.3** Verify RLS behaves, not just that the SQL ran. In the SQL editor:

```sql
set role authenticated;
set request.jwt.claims to '{"sub":"<some other user uuid>"}';
select * from public.nights;   -- must return zero rows
```

**4.4** Regenerate types and diff:

```bash
npx supabase gen types typescript --project-id <ref> > /tmp/types.ts
diff /tmp/types.ts src/lib/database.types.ts
```

**4.5** Authentication → URL Configuration → Redirect URLs:

```
thirtynights://auth/callback
thirtynights-staging://auth/callback
thirtynights-dev://auth/callback
```

**4.6** Authentication → Providers → enable **Anonymous sign-ins** and **Manual
linking**. The entire local-first model depends on both; without them the app
cannot start.

**4.7** Custom SMTP. The built-in sender allows a handful of mails per hour and
then fails silently — which in beta looks exactly like "the email link is
broken". Resend, Postmark, or SES all work.

**4.8** Enable CAPTCHA and tighten auth rate limits.

**4.9** Enable Point-in-Time Recovery. This app holds the only copy of things
people cannot re-record.

**4.10** Deploy all three Edge Functions:

```bash
npx supabase functions deploy revenuecat-webhook
npx supabase functions deploy delete-account
npx supabase functions deploy apple-identity
```

**4.11** Remaining function secrets:

```bash
npx supabase secrets set \
  REVENUECAT_WEBHOOK_AUTH=<random 32+ chars, you invent this> \
  REVENUECAT_WEBHOOK_HMAC_SECRET=<from RevenueCat, Part 5> \
  REVENUECAT_SECRET_API_KEY=<from RevenueCat, Part 5>
```

---

## Part 5 — RevenueCat and in-app purchases

You have not signed up for RevenueCat. You do not need to remember doing so —
it is an architecture choice baked into the code, not an account you forgot.
It is free below $2,500/month of tracked revenue. See the end of Part 5 if you
would rather not use it.

**5.1** Create the two products in App Store Connect → your app → In-App
Purchases. Both must be **Non-Consumable** — not subscriptions. The paywall
says "nothing renews, ever", and a reviewer will check that the product type
matches the claim.

| Product ID | Reference name | What it grants |
|---|---|---|
| `com.thirtynights.nights30` | Thirty Nights | Extends the chapter to night 30 |
| `com.thirtynights.nights90` | Ninety Nights | Extends to night 90, reports at 30/60/90 |

Set prices and territories. Each product needs a screenshot and a review note
before it can be submitted — attach a paywall screenshot once you have one from
Part 8.

**5.2** Sign up at revenuecat.com. Create a project, add an **iOS app** with
bundle ID `com.thirtynights.app`.

**5.3** Connect App Store credentials: upload an App Store Connect API key
(In-App Purchase role) so RevenueCat can validate receipts.

**5.4** Import both products, then create an **Offering** containing both
packages.

**5.5** Copy the **public** iOS SDK key (`appl_…`). This one is safe in the app
bundle. Also generate a **secret** API key for the deletion function — that one
is server-only and goes in 4.11.

**5.6** Integrations → Webhooks → point at:
`https://<ref>.supabase.co/functions/v1/revenuecat-webhook`
Enable HMAC signing, and set the Authorization header to the same random string
you used for `REVENUECAT_WEBHOOK_AUTH`.

**5.7** Sandbox test on a real device with a Sandbox Apple ID (App Store Connect
→ Users and Access → Sandbox Testers):
- Buy 30 nights → access unlocks **only after the server grant lands**. The
  client deliberately sits at "verifying" until the webhook writes the grant.
  If it unlocks instantly, the webhook is not wired.
- Delete the app, reinstall, sign in, tap Restore → access returns
- Refund via sandbox → access is withdrawn

> **If you would rather skip RevenueCat:** you would own App Store Server API
> receipt validation, App Store Server Notifications V2, refund handling, and
> cross-device restore yourself, and you would rewrite `commerce.ts`, the
> webhook function, and the grant RPC. Realistically a week, in the one area
> where a bug means either giving away paid content or charging for nothing.

---

## Part 6 — The report worker

Without this, people record seven nights and no report ever arrives.

**6.1** Create a **dedicated** OpenAI project with its own key and a hard spend
limit. Not your personal key.

**6.2** Confirm both model IDs resolve on your account:

```bash
curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

- `gpt-4o-transcribe-diarize` — correct. The worker relies on its
  `response_format: diarized_json` and per-segment timestamps, which is what the
  evidence clips are cut from. Do not substitute a plain Whisper model; the
  report validator rejects evidence it cannot locate in a timestamped segment.
- `gpt-5.6` — **verify this one.** GPT-5.6 ships as tiers (Sol / Terra / Luna)
  and the bare string may not be a callable ID. A wrong ID surfaces as
  `report_analysis_404`: the worker keeps polling, reports never arrive, and it
  reads as slowness rather than an outage. This job is strict-schema extraction
  over transcripts, not open-ended reasoning — the mid or cheap tier is the
  right default, not the flagship.

There is **no text-to-speech dependency**. "Report audio" is the user's own
voice, cut with ffmpeg from their recordings. Only the two endpoints above are
called.

### What it will cost you

Per user, for a full chapter, at August 2026 list prices and assuming a
2-minute average recording (the app allows 10–300s):

| | Transcription | Reports | Total |
|---|---|---|---|
| 30-night chapter | ~$0.36 | ~$0.05 | **~$0.41** |
| 90-night chapter | ~$1.08 | ~$0.21 | **~$1.30** |

Transcription dominates and scales linearly with how long people actually talk;
if they use the full 300 seconds, multiply it by 2.5. Reports are cheap because
the input is text by then. Both are comfortably inside any sensible price for
the IAP — but set the spend limit anyway, because a retry loop against a
misconfigured model is the failure mode that costs money.

**6.3** Deploy the container (`worker/Dockerfile`). Fly.io, Railway, Render, and
Cloud Run all work. It is a polling worker, not a web service — do not put it
behind a scale-to-zero configuration that stops it polling.

**6.4** Secrets go in the **host** secret manager, never in the image:
`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

**6.5** Point the host's liveness probe at `GET /healthz`. It reports `degraded`
when the loop has stalled, which is what turns a silent death into a restart.

**6.6** Set an alert on:

```sql
select count(*) from private.report_jobs where status = 'failed';
```

**6.7** End-to-end test: seal 7 nights (you can shift device dates), confirm the
mini report generates, evidence clips render, and audio plays back in the app.

---

## Part 7 — Legal pages and privacy declarations

**7.1** Publish four HTTPS pages. The production build **refuses to compile**
with placeholder or non-HTTPS values — that is deliberate, not a bug:

| Env var | Page |
|---|---|
| `EXPO_PUBLIC_PRIVACY_URL` | Privacy policy |
| `EXPO_PUBLIC_TERMS_URL` | Terms of use |
| `EXPO_PUBLIC_SUPPORT_URL` | Support / contact |
| `EXPO_PUBLIC_DELETE_ACCOUNT_URL` | Web account deletion |

**7.2** The privacy policy must state explicitly:
- what is collected: voice recordings, email, purchase history, device timezone
- that **recordings are sent to a third-party model provider** for transcription
  and reflection — this is the disclosure most likely to be missing
- retention period
- how to request deletion

**7.3** App Store Connect → App Privacy. Declare at minimum: Audio Data,
Contact Info (email), Purchases, Identifiers. Mark what is linked to identity
and what is used for tracking (nothing should be, unless you add analytics).

**7.4** Set every EAS production variable:

```bash
eas env:create --environment production --name EXPO_PUBLIC_APP_ENV --value production
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_...
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_...
eas env:create --environment production --name EXPO_PUBLIC_NIGHTS_30_PRODUCT_ID --value com.thirtynights.nights30
eas env:create --environment production --name EXPO_PUBLIC_NIGHTS_90_PRODUCT_ID --value com.thirtynights.nights90
eas env:create --environment production --name EXPO_PUBLIC_PRIVACY_URL --value https://...
eas env:create --environment production --name EXPO_PUBLIC_TERMS_URL --value https://...
eas env:create --environment production --name EXPO_PUBLIC_SUPPORT_URL --value https://...
eas env:create --environment production --name EXPO_PUBLIC_DELETE_ACCOUNT_URL --value https://...
```

The Android RevenueCat key is no longer required.

---

## Part 8 — Store listing

**8.1** Screenshots. Capture on a 6.9" simulator (iPhone 17 Pro Max or
equivalent) at **1320 × 2868**, 3–10 of them. App Store Connect scales that set
down for smaller devices, so one set is enough; confirm in the upload UI, since
Apple adjusts required sizes periodically. `screenshots/` currently holds
emulator dev captures — not usable.

Suggested order, mirroring the product's argument: the night card → recording →
the sealed keepsake → Gallery → Light Map → a report.

**8.2** Description, subtitle, keywords, promotional text.

**8.3** Category: Health & Fitness, or Lifestyle. Health & Fitness draws
slightly more scrutiny on wellbeing claims — the report copy is already
deliberately non-diagnostic, keep it that way in the listing.

**8.4** Age rating questionnaire.

**8.5** App Review notes. Write these carefully; they prevent the most likely
false rejection:

> Thirty Nights asks one question per night and cannot be advanced faster —
> night 2 will not open until the following evening. This is the product, not a
> bug. To review the full flow please use the demo account below, which is
> pre-seeded with completed nights and a generated report.
>
> Privacy, Terms and Delete Account are reachable from Settings without signing
> in. Purchases are non-consumable and one-time; nothing renews. Restore
> Purchases is on the paywall and in Settings.

Provide a demo account with pre-seeded nights. A reviewer who opens the app,
records one night, and finds they cannot continue will reject it as
non-functional.

---

## Part 9 — Build, test, submit

**9.1** Local gates:

```bash
npm run check        # typecheck + tests + worker + web export
npm run doctor       # expect 20/20
npm run audit:release
```

**9.2** Build:

```bash
eas build --platform ios --profile production
```

First run will offer to generate signing credentials — let EAS manage them
unless you have a reason not to.

**9.3** Submit to TestFlight:

```bash
eas submit --platform ios --profile production
```

**9.4** On a **physical iPhone**, run the whole journey:

- [ ] Onboarding → intentions → hour → notification permission → plan screen
- [ ] Notification actually fires at the chosen hour
- [ ] Record → seal → keepsake reward
- [ ] Force-quit mid-recording; nothing corrupts
- [ ] Airplane mode: record offline, confirm it syncs on reconnect
- [ ] Seven nights → mini report generates and plays
- [ ] Paywall shows **real localized prices** without an account
- [ ] Sandbox purchase → access unlocks only after server verification
- [ ] Restore on a second device
- [ ] **Sign in with Apple → delete account → confirm the app disappears from
      Settings → Apple ID → Sign in with Apple.** This is the revocation check.
      If it is still listed, revocation did not work and you will be rejected.
- [ ] Privacy, Terms, Delete Account all reachable without an account
- [ ] Maximum system font size — nothing clips
- [ ] Reduce Motion enabled — nothing breaks

**9.5** Submit for review. Expect 24–48 hours; first submissions sometimes
longer.

---

## Part 10 — Most likely rejection reasons, ranked

1. **Apple token not revoked on deletion** (5.1.1(v)) — now implemented, but
   untested against Apple. Verify it with the Settings check in 9.4.
2. **Reviewer cannot progress past night 1** and reports the app as
   non-functional. Mitigated entirely by the demo account in 8.5.
3. **Privacy policy does not disclose third-party model processing** of voice
   recordings. Audio is sensitive; this gets read.
4. **IAP configured as subscriptions**, contradicting "nothing renews".
5. **Purchases fail in review** because Agreements/Tax/Banking is not Active.
6. **Missing or non-functional Restore.** Present in both places — just confirm
   it works against a real sandbox purchase.

---

## Appendix — Android, later

`docs/PRODUCTION_CHECKLIST.md` retains the Play-side steps. To re-enable Google
Sign-In you need: a Google Cloud OAuth **Web** client, the Supabase callback as
an authorized redirect URI, a published consent screen, the provider enabled in
Supabase, and the button restored in `AuthScreen.tsx` (`continueWithApple` shows
the shape; `linkOAuthIdentity('google')` and `signInWithOAuthProvider('google')`
are still exported and working).

Also required for Play: the Data safety form, a 1024×500 feature graphic, a
512×512 icon, and the Android RevenueCat key in EAS.
