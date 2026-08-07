# Thirty Nights — App Store Launch Guide

Last updated: 2026-08-06 · Supabase project `hnlanyoyktxpllgxgorz`

The authoritative document for the v1 launch. **iOS only.** Google Sign-In is
removed from the UI; sign-in is Apple + email link.
`docs/PRODUCTION_CHECKLIST.md` is kept only for the later Android release.

Work top to bottom. Phases 2–6 can overlap; Phase 1 gates almost everything.

---

## Where you actually are

### ✅ Done and verified against the live project (2026-08-06)

Verified by probing the REST and Auth APIs directly, not by assumption:

- **Supabase production project exists** and is reachable
- **All five migrations applied.** All eight RPCs resolve —
  `initialize_chapter_schedule`, `reconcile_chapter_state`, `sync_sealed_night`,
  `attach_night_audio`, `retry_report`, `process_revenuecat_event`,
  `store_apple_refresh_token`, `get_apple_refresh_token`
- **Anonymous sign-ins enabled** — live signup returns a session with
  `is_anonymous: true`
- **Auto-provisioning works** — a fresh user immediately has chapter and night rows
- **RLS genuinely isolates users** — a second test user saw only its own chapter
- **Server-only ledger is sealed** — `webhook_events` denies `authenticated`
- **Email auth on**, `mailer_autoconfirm: false` (verification required — correct)
- **Storage buckets created** with the right constraints:
  `recordings` (10 MB, 5 policies, m4a/mp4/aac/webm/wav) and
  `report-audio` (50 MB, 1 policy, m4a/mp4/mpeg)

### ✅ Code work completed

| Change | Where |
|---|---|
| Google Sign-In button removed | `src/screens/AuthScreen.tsx` |
| Production build no longer requires a Play RevenueCat key | `app.config.ts` |
| Deletion copy says "the App Store" | `src/screens/SettingsScreen.tsx` |
| Apple token revocation (guideline 5.1.1(v)) | `_shared/apple.ts`, `apple-identity/`, migration `…145157`, `delete-account` |
| Export compliance declared, iPad disabled, notification icon mask | `app.config.ts`, `assets/app/` |
| Store prices load without an account | `src/services/commerce.ts` |
| Worker upstream deadlines + `/healthz` | `worker/src/index.ts` |

The app itself — recording, sealing, 90 questions, onboarding, paywall, Gallery,
Light Map, Settings, export, deletion — is built and passing. What remains is
infrastructure it talks to, and paperwork.

### ❌ Two test artifacts to clean up

Two anonymous users (and their chapters) were created while verifying the
backend. Authentication → Users → delete them. Harmless otherwise; Supabase
purges abandoned anonymous users after 30 days.

---

## Phase 1 — Today, in this order

### Step 1.1 — Rotate the two exposed credentials 🔴

A secret key and the database password were pasted into a chat transcript.

1. Dashboard → Project Settings → **API Keys** → revoke `sb_secret_…` → generate new
2. Dashboard → Project Settings → **Database** → Reset database password
3. Choose a password with **no** `#`, `@`, `/`, `:` or `?` — those break URI
   parsing and will silently fail in the worker's `DATABASE_URL`

The publishable key and project URL are safe and need no action; they ship
inside the app by design.

### Step 1.2 — Start Apple Developer enrolment 🔴

This is the long pole. It gates Sign in with Apple, in-app purchases,
RevenueCat, TestFlight, and any device build with entitlements.

1. developer.apple.com → Enroll → **$99/year**
2. Individual is fine. Organization needs a D-U-N-S number and takes longer.
3. Once approved: App Store Connect → **Agreements, Tax, and Banking** → accept
   the Paid Applications agreement, complete tax and banking forms

> **Purchases cannot be tested in sandbox until Agreements shows Active.** This
> is the step people lose a week to. Start it the day you are approved.

### Step 1.3 — Add the auth redirect URLs

Dashboard → Authentication → **URL Configuration** → Redirect URLs, add all three:

```
thirtynights://auth/callback
thirtynights-staging://auth/callback
thirtynights-dev://auth/callback
```

### Step 1.4 — Confirm Manual linking is on

Dashboard → Authentication → Settings → **Manual linking** → enabled.

The anonymous-to-Apple upgrade calls `linkIdentity()`, which fails without it.
Anonymous sign-in being on is not sufficient.

---

## Phase 2 — Finish Supabase hardening

### Step 2.1 — Custom SMTP

Dashboard → Project Settings → Authentication → SMTP Settings.

The built-in sender allows a few mails per hour then fails **silently**, which
in beta is indistinguishable from "the email link is broken". Resend, Postmark
or SES all work.

### Step 2.2 — CAPTCHA and rate limits

Authentication → Settings → enable CAPTCHA (hCaptcha or Turnstile) and tighten
the auth rate limits.

### Step 2.3 — Point-in-Time Recovery

Project Settings → Database → enable PITR. This app holds the only copy of
things people cannot re-record.

### Step 2.4 — Deploy the three Edge Functions

In your own terminal (this needs a TTY):

```powershell
cd C:\Users\pabat\OneDrive\Documents\thirtynights\thirtynights
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # supabase.com/dashboard/account/tokens
npx supabase functions deploy revenuecat-webhook
npx supabase functions deploy delete-account
npx supabase functions deploy apple-identity
```

Never paste that access token into a chat — it is account-wide.

### Step 2.5 — Verify the deploys

```powershell
npx supabase functions list
```

All three should show as deployed. `apple-identity` will return
`{"stored":false,"reason":"not_configured"}` until Phase 3 — that is correct
behaviour, not an error.

---

## Phase 3 — Apple credentials (after enrolment approves)

### Step 3.1 — Register the App ID

developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers** →
**+** → App IDs → App.

- Bundle ID: `com.thirtynights.app` (explicit, not wildcard)
- Capabilities: tick **Sign in with Apple** and **In-App Purchase**

### Step 3.2 — Create the Sign in with Apple key

developer.apple.com → **Keys** → **+**

- Name: `Thirty Nights Sign in with Apple`
- Tick **Sign in with Apple**, Configure → select your primary App ID
- Continue → Register → **Download the `.p8`**

> **You get exactly one download.** Put it in a password manager immediately.
> Note the **Key ID** shown beside it.

### Step 3.3 — Note your Team ID

developer.apple.com → Membership → Team ID.

### Step 3.4 — Enable the Apple provider in Supabase

Dashboard → Authentication → Providers → **Apple** → Enable.

Authorized Client IDs: `com.thirtynights.app`

That is all the native flow needs. **No Services ID, no secret key here** — the
device sends an identity token that Supabase validates directly.

### Step 3.5 — Set the Apple function secrets

```powershell
npx supabase secrets set APPLE_TEAM_ID=<team id> APPLE_KEY_ID=<key id> APPLE_CLIENT_ID=com.thirtynights.app
```

For the private key, use the **dashboard**, not the CLI: Project Settings → Edge
Functions → Secrets → Add new secret → name `APPLE_PRIVATE_KEY`, and paste the
entire `.p8` including the `-----BEGIN PRIVATE KEY-----` and `-----END-----`
lines. Multi-line values through a shell are where this goes wrong.

> `APPLE_CLIENT_ID` is the **bundle identifier**, not a Services ID. Services IDs
> belong to the web redirect flow; using one makes Apple answer `invalid_client`,
> and that error only surfaces at deletion time.

### Step 3.6 — Redeploy the functions that read those secrets

```powershell
npx supabase functions deploy apple-identity
npx supabase functions deploy delete-account
```

---

## Phase 4 — Money

### Step 4.1 — Create the two products in App Store Connect

Your app → Monetization → **In-App Purchases** → **+**

| Product ID | Reference name | Type |
|---|---|---|
| `com.thirtynights.nights30` | Thirty Nights | **Non-Consumable** |
| `com.thirtynights.nights90` | Ninety Nights | **Non-Consumable** |

> Non-consumable, **not** subscriptions. The paywall says "nothing renews, ever"
> and a reviewer will check the product type matches the claim.

Set prices and territories. Each product needs a screenshot and review note
before submission — attach a paywall screenshot from Phase 7.

### Step 4.2 — RevenueCat project

You have not signed up, and you do not need to remember doing so — it is an
architecture choice baked into the code, not an account you forgot. Free below
$2,500/month tracked revenue.

1. revenuecat.com → new project
2. Add an **iOS app**, bundle ID `com.thirtynights.app`
3. Upload an App Store Connect API key (In-App Purchase role) so RevenueCat can
   validate receipts

### Step 4.3 — Import products and create an offering

Import both product IDs, then create an **Offering** containing both packages.

### Step 4.4 — Collect two keys

- **Public iOS SDK key** (`appl_…`) — safe in the app bundle, goes in EAS (Phase 6)
- **Secret API key** — server-only, goes in Supabase secrets (next step)

### Step 4.5 — Webhook

RevenueCat → Integrations → Webhooks:

- URL: `https://hnlanyoyktxpllgxgorz.supabase.co/functions/v1/revenuecat-webhook`
- Enable **HMAC signing**, copy the secret
- Set an Authorization header to a random 32+ character string you invent

Then:

```powershell
npx supabase secrets set REVENUECAT_WEBHOOK_AUTH=<your random string> REVENUECAT_WEBHOOK_HMAC_SECRET=<from RevenueCat> REVENUECAT_SECRET_API_KEY=<secret key>
npx supabase functions deploy revenuecat-webhook
```

---

## Phase 5 — The AI worker

Without this, people record seven nights and no report ever arrives.

### Step 5.1 — OpenAI project

A **dedicated** project with its own key and a hard spend limit. Not your
personal key — you want to be able to revoke it without breaking anything else.

### Step 5.2 — Verify both model IDs resolve

```bash
curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

- `gpt-4o-transcribe-diarize` — correct as-is. The worker depends on its
  `diarized_json` format and per-segment timestamps; the evidence clips are cut
  from them. Do not substitute plain Whisper — the validator rejects any quote
  it cannot locate in a timestamped segment.
- `gpt-5.6` — **verify.** GPT-5.6 ships as tiers (Sol / Terra / Luna) and the
  bare string may not be callable. A wrong ID surfaces as `report_analysis_404`:
  the worker keeps polling, reports never arrive, and it reads as slowness. This
  job is strict-schema extraction, not open-ended reasoning — pick the mid or
  cheap tier, not the flagship.

There is **no text-to-speech dependency.** "Report audio" is the user's own
voice, cut with ffmpeg.

**Expected cost per user, full chapter, 2-minute average recording:**

| | Transcription | Reports | Total |
|---|---|---|---|
| 30-night | ~$0.36 | ~$0.05 | **~$0.41** |
| 90-night | ~$1.08 | ~$0.21 | **~$1.30** |

### Step 5.3 — Deploy the container

`worker/Dockerfile`. Fly.io, Railway, Render or Cloud Run all work.

> It is a **polling worker, not a web service.** Do not put it behind
> scale-to-zero — it stops polling and reports quietly stop arriving.

### Step 5.4 — Connection string

Use the **Supavisor session pooler** string from Project Settings → Database,
not the direct `db.<ref>.supabase.co:5432` one — direct connections are
IPv6-only without the IPv4 add-on, and many hosts have no IPv6 outbound.

**Session** mode, not transaction: the worker uses `FOR UPDATE SKIP LOCKED`
job leasing.

Remember to URL-encode any special characters in the password.

### Step 5.5 — Host secrets

In the **host** secret manager, never in the image:
`DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

### Step 5.6 — Liveness probe

Point it at `GET /healthz`. It reports `degraded` when the loop stalls, which is
what turns a silent death into a restart.

### Step 5.7 — Alert on stuck jobs

```sql
select count(*) from private.report_jobs where status = 'failed';
```

---

## Phase 6 — Legal pages and configuration

### Step 6.1 — Publish four HTTPS pages

The production build **refuses to compile** with placeholder or non-HTTPS
values. That is deliberate.

| Env var | Page |
|---|---|
| `EXPO_PUBLIC_PRIVACY_URL` | Privacy policy |
| `EXPO_PUBLIC_TERMS_URL` | Terms of use |
| `EXPO_PUBLIC_SUPPORT_URL` | Support / contact |
| `EXPO_PUBLIC_DELETE_ACCOUNT_URL` | Web account deletion |

### Step 6.2 — The privacy policy must say, explicitly

- What is collected: voice recordings, email, purchase history, device timezone
- **That recordings are sent to a third-party model provider** for transcription
  and reflection — this is the disclosure most likely to be missing, and audio
  is sensitive enough that it gets read
- Retention period
- How to request deletion

### Step 6.3 — Set every EAS production variable

```powershell
eas env:create --environment production --name EXPO_PUBLIC_APP_ENV --value production
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://hnlanyoyktxpllgxgorz.supabase.co
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

### Step 6.4 — Fill in `eas.json`

Replace the two placeholders in `submit.production.ios`:

- `ascAppId` — the numeric Apple ID from App Store Connect → App Information
- `appleTeamId` — developer.apple.com → Membership

Neither is secret. The App Store Connect API key **is**, and belongs in EAS
credentials, not the repo.

---

## Phase 7 — Build and TestFlight

### Step 7.1 — Local gates

```powershell
npm run check          # typecheck + tests + worker + web export
npm run doctor         # expect 20/20
npm run audit:release
```

### Step 7.2 — Build

```powershell
eas build --platform ios --profile production
```

First run offers to generate signing credentials — let EAS manage them unless
you have a reason not to.

### Step 7.3 — Submit to TestFlight

```powershell
eas submit --platform ios --profile production
```

### Step 7.4 — Capture screenshots

From the TestFlight build on a 6.9" device or simulator, at **1320 × 2868**,
3–10 images. App Store Connect scales one set down for smaller devices; confirm
required sizes in the upload UI, as Apple adjusts them periodically.

Suggested order, mirroring the product's argument: night card → recording →
sealed keepsake → Gallery → Light Map → a report.

`screenshots/` currently holds emulator dev captures — not usable.

---

## Phase 8 — The device test that decides everything

On a **physical iPhone**, not a simulator:

- [ ] Onboarding → intentions → hour → notification permission → plan screen
- [ ] Notification actually fires at the chosen hour
- [ ] Record → seal → keepsake reward
- [ ] Force-quit mid-recording; nothing corrupts
- [ ] Airplane mode: record offline, confirm it syncs on reconnect
- [ ] Seven nights → mini report generates and plays
- [ ] Paywall shows **real localized prices without an account**
- [ ] Sandbox purchase → access unlocks **only after** server verification
      (if it unlocks instantly, the webhook is not wired)
- [ ] Restore on a second device
- [ ] 🔴 **Sign in with Apple → delete account → check Settings → Apple ID →
      Sign in with Apple.** The app must be **gone** from that list. If it is
      still there, revocation failed and you will be rejected.
- [ ] Privacy, Terms, Delete Account reachable **without** an account
- [ ] Maximum system font size — nothing clips
- [ ] Reduce Motion enabled — nothing breaks

The Apple revocation path has never run against Apple's servers — it could not,
until Phase 3 existed. This checklist item is the only real test of it.

---

## Phase 9 — Store listing and submit

### Step 9.1 — Listing

Description, subtitle, keywords, promotional text.
Category: Health & Fitness or Lifestyle. Health & Fitness draws more scrutiny on
wellbeing claims — the report copy is deliberately non-diagnostic, keep the
listing that way too.

### Step 9.2 — App Privacy labels

App Store Connect → App Privacy. Declare at minimum: **Audio Data**, **Contact
Info** (email), **Purchases**, **Identifiers**. Mark what is linked to identity;
nothing should be marked as tracking unless you add analytics.

### Step 9.3 — Age rating questionnaire

### Step 9.4 — App Review notes

Write these carefully — they prevent the most likely false rejection:

> Thirty Nights asks one question per night and cannot be advanced faster —
> night 2 will not open until the following evening. This is the product, not a
> bug. Please use the demo account below, pre-seeded with completed nights and a
> generated report, to review the full flow.
>
> Privacy, Terms and Delete Account are reachable from Settings without signing
> in. Purchases are non-consumable and one-time; nothing renews. Restore
> Purchases is on the paywall and in Settings.

**Provide a demo account with pre-seeded nights.** A reviewer who records one
night and finds they cannot continue will reject the app as non-functional.

### Step 9.5 — Submit

Expect 24–48 hours. First submissions sometimes longer.

---

## Most likely rejection reasons, ranked

1. **Apple token not revoked on deletion** (5.1.1(v)) — implemented, untested.
   Phase 8 is the check.
2. **Reviewer cannot get past night 1** — fully mitigated by the demo account.
3. **Privacy policy omits third-party model processing** of voice recordings.
4. **IAP configured as subscriptions**, contradicting "nothing renews".
5. **Purchases fail in review** because Agreements/Tax/Banking is not Active.
6. **Missing or broken Restore** — present in both places, just verify it.

---

## Still unwired, deliberately

- **Sentry** — `ErrorBoundary` currently `console.error`s into the void in
  production. Give me a DSN and I will wire it and scrub recording paths and
  email from events.
- **Product analytics** — you have zero measurement, so the new onboarding and
  paywall cannot be evaluated. Whatever you choose must be declared in Step 9.2.

Neither blocks submission. Both make the first month afterwards much less blind.

---

## Appendix — Android, later

`docs/PRODUCTION_CHECKLIST.md` retains the Play-side steps. To restore Google
Sign-In you need a Google Cloud OAuth **Web** client, the Supabase callback as
an authorized redirect URI, a published consent screen, the provider enabled in
Supabase, and the button back in `AuthScreen.tsx` — `linkOAuthIdentity('google')`
and `signInWithOAuthProvider('google')` are still exported and working.

Also required: the Data safety form, a 1024×500 feature graphic, a 512×512 icon,
and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` in EAS.
