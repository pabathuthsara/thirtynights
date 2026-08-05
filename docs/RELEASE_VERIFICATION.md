# Thirty Nights — Release Verification

This is the operational gate for a release candidate. It complements the production manual; it does not replace provider setup, legal review, or physical-device evidence.

## 1. Freeze the candidate

Record the Git commit, app version/build numbers, EAS environment, Supabase migration head, RevenueCat offering revision, worker image digest, report prompt/schema versions, and privacy-policy revision. Test and promote the same artifacts. Do not rebuild after sign-off without restarting the affected gates.

No password, service-role key, webhook secret, store private key, service-account JSON, or OpenAI key belongs in this record.

## 2. Local and CI gates

Use Node 22 and clean lockfile installs.

```bash
npm ci
npm ci --prefix worker
npm run check
npm run doctor
npm run audit:release
```

`npm run check` covers app TypeScript, domain and worker contract tests, the worker TypeScript build check, and a production browser export. The browser export is not evidence for native audio, notifications, authentication, billing, SQLite, SecureStore, or FileSystem behavior.

With Docker Desktop or Podman running, verify the database from zero:

```bash
npm run db:start
npm run db:verify
npm run db:stop
```

The database gate must apply every forward migration, pass lint at error level, and pass every pgTAP assertion. Run the same sequence in CI. A failure blocks beta promotion.

## 3. Configuration gate

For the intended EAS environment, verify that all public values are real and environment-specific:

- Supabase URL and publishable key.
- RevenueCat public iOS/Android SDK keys and final consumable product IDs.
- HTTPS privacy, terms, support, and account-deletion URLs.
- `EXPO_PUBLIC_APP_ENV` matches development, preview/staging, or production.

Verify server-only values directly in the destination secret managers: Supabase service role, RevenueCat webhook authorization/HMAC secrets, RevenueCat secret API key, database URL, OpenAI key/models, and report prompt/schema versions. Do not print their values during verification.

Production must not contain placeholder provider values, sample reports/archive months, developer preview controls, accelerated dates, or local paid grants.

## 4. Backend and worker gate

- Apply migrations from zero in an isolated local stack, then on staging before production.
- Confirm `private` tables are not exposed through the Data API and mobile roles cannot write purchases, grants, report readiness, refunds, webhook events, or deletion audits.
- Run two-user and anonymous-account RLS/Storage tests. Anonymous users must not upload raw recordings.
- Replay a signed RevenueCat fixture and confirm one event outcome, one ledger transition, and one chapter grant.
- Run synthetic 7-, 30-, 60-, and 90-night report fixtures through lease, hash verification, transcription adapter, strict report validation, clip rendering, publish, retry, and worker-crash recovery.
- Confirm logs contain trace IDs, timing, byte counts, status, and model versions only—never audio, transcript text, selected quotes, signed URLs, or local paths.

## 5. Build and distribution gate

Owner-authorized commands:

```bash
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform android --profile development
npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production
```

Development builds must install without overwriting the production app identity once environment-specific identifiers are enabled. Production submission requires final icons/splash assets, linked EAS project metadata, signing authorization, store app records, approved IAP products, and live legal/support URLs.

## 6. Physical-device matrix

Capture device model, OS, build identifier, tester, date, result, and defect link for every row.

| Area | iPhone evidence | Android evidence |
|---|---|---|
| Install/update | Smallest supported iPhone and current notched/Dynamic Island device | Current Pixel, Samsung, and lowest supported OS/RAM profile |
| Recording | Permission deny/allow, call/Siri/lock, route change, low storage, crash during seal | Permission deny/allow, call/alarm/lock, Bluetooth/USB route, low storage, process kill during seal |
| Notifications | Denied/allowed, Focus modes, timezone/DST, stale tap | Android 13+ channel-before-permission, battery restrictions, timezone/DST, stale tap |
| Accessibility | VoiceOver, Dynamic Type, Reduce Motion, contrast/touch targets | TalkBack, font scaling, Reduce Motion, contrast/touch targets |
| Network/data | Airplane mode, poor Wi-Fi, cellular opt-in/out, reinstall | Airplane mode, poor Wi-Fi, cellular opt-in/out, OEM background restrictions |
| Identity | Anonymous→email and native Apple with unchanged UUID; existing-account collision | Anonymous→email/Google with unchanged UUID; existing-account collision |
| Billing | 30/90 success, cancel, Ask to Buy/pending, refund, reinstall | 30/90 success, decline/pending, acknowledgement/consumption, refund, reinstall |

## 7. Critical journeys

Pass each journey from a fresh store-distributed staging build without Metro, developer menus, database edits, or manual grants:

1. Fresh seven-night trial, correct expected dates, no pre-reveal playback, real mini-report, and paywall.
2. Account upgrade with unchanged Supabase UUID, then verified 30-night purchase and night-30 report.
3. Verified 90-night purchase with unique question segments and reports at 30/60/90.
4. Offline sealing across eligible nights, later idempotent Wi-Fi/cellular backup, and exactly one report job.
5. Crash/interruption at recorder, seal, upload, webhook, lease, render, and publish boundaries.
6. Reinstall/second-device recovery with honest warnings for audio that existed only on the first phone.
7. Missed dates, travel/timezone change, and clock changes without duplicate or backdated recording.
8. Refund/revocation freezing future access without deleting sealed recordings.
9. Private export followed by in-app deletion and the public web deletion path.

## 8. Promotion and stop rules

- Zero open P0 issues: data loss, privacy exposure, incorrect purchase grant, inability to record, or deletion failure.
- Zero open P1 issues for launch candidate: repeated fabricated/failed reports, duplicate nights, locked paid access, restore/recovery failure, or major accessibility blocker.
- Use staged rollout with named on-call and support owners.
- Stop promotion for elevated crash rate, recording/seal failures, purchase verification backlog, webhook authentication failures, report queue age/failure, Storage policy regression, or deletion backlog.
- Roll back the app only when the previous binary remains compatible with the applied database migrations. Prefer disabling affected server features or pausing rollout when a binary rollback would risk local data.
