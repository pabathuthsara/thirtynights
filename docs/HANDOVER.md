# Thirty Nights — Engineering Handover

Last updated: 2026-08-03 (Asia/Colombo)

## Current status

Implementation is in progress from the requirements in `Thirty Nights - Production Build Device Testing and Launch Manual.docx`. The mobile app and report worker currently compile, the automated app/worker suite passes, Expo Doctor passes, the browser production export succeeds, and an isolated iOS/Android prebuild smoke succeeds.

The existing repository started as a functional Expo shell with real recording, local snapshot persistence, local reminders, and preview-only versions of commerce, reports, Gallery, Light Map, backup, export, and deletion.

## Product decisions used for implementation

- The first seven nights are included in both paid plans.
- The 30-night purchase extends the active first chapter to night 30.
- The 90-night purchase extends it to night 90, with reports at nights 30, 60, and 90.
- A missed scheduled date cannot be recorded later.
- Recordings are limited to 10–300 seconds; a shorter answer can be explicitly sealed.
- Raw audio remains on-device until the user has a recoverable account.
- Backup defaults to Wi-Fi only, with an explicit cellular opt-in.
- Reports are reflective and evidence-grounded, never diagnostic or therapeutic.
- iPad support is disabled for the v1 release unless it receives deliberate layout/device testing.

## Work completed

- Read and mapped the production implementation manual.
- Reviewed current Expo, React Native, Supabase, RevenueCat, Expo FileSystem/SQLite, and OpenAI implementation guidance.
- Installed the Expo native modules for development builds, durable files, SQLite, secure storage, network state, sharing, localization, and Apple authentication.
- Added a versioned normalized SQLite store, durable deterministic audio files, checksum/size manifest, and transactional outbox insertion. A browser-only repository avoids loading native SQLite/WASM into the browser preview.
- Replaced the stale `today` promotion rule with expected-local-date reconciliation and explicit missed nights.
- Added rolling app-owned local notifications, Android channel-first permission setup, private lock-screen previews, and notification deep-link safety.
- Added secure Supabase PKCE session storage, anonymous startup, same-UUID email upgrades, OAuth identity linking, and native iOS Apple identity linking. Existing-account sign-in is stopped when this phone owns recordings that require a reviewed merge.
- Added Wi-Fi/cellular backup policy, user-visible vendor-processing consent, immutable standard/TUS uploads, signed playback, local export ZIPs, and cloud/device deletion paths.
- Replaced preview Home, Gallery, Light Map, reports, paywall, and Settings behavior with real selectors and service state. Production purchases use localized store products and remain server-verifying until a database grant is observed.
- Added the forward Supabase production migration with explicit Data API grants, narrow idempotent seal/attachment RPCs, server-only ledger transitions, webhook replay protection, report checkpoints/jobs, transcript segments, report audio, and deletion audit state.
- Added RevenueCat raw-body authorization/HMAC verification and account-deletion Edge Functions.
- Added a Node 22 report worker that leases jobs, verifies audio hashes, calls server-only transcription/report APIs, enforces a strict report schema, rejects false quotes/citations, builds evidence clips with ffmpeg, and publishes reports transactionally.
- Extracted the worker report validator into a testable contract and added adversarial checks for false/missing quotes, wrong-night citations, out-of-bounds clips, duplicate segment IDs, code-switched text, version/checkpoint mismatches, and mini-report limits.
- Hardened the client sync boundary in a new forward migration: operation IDs are scoped per user and concurrency-serialized, an operation cannot be reused with changed payload, sealed metadata is immutable, recorded date/hour must match the scheduled timezone, and uploaded object paths must exactly match the owned chapter/night.
- Completed the preview-snapshot recording migration path: reachable legacy audio is moved to deterministic durable storage, checksummed, written with its manifest and metadata outbox in one SQLite transaction, and missing audio is surfaced as requiring attention while the old snapshot remains available.
- Added local Supabase configuration plus reset/lint/pgTAP scripts and wired them into CI so migrations are applied from zero when Docker is available.
- Replaced static app configuration with environment-aware development/staging/production names, bundle/package IDs, and deep-link schemes. Production config now fails closed when provider/product/legal values are missing or use placeholders.
- Added the SDK-matched Expo System UI module after native prebuild identified the missing dark-mode integration.
- Added `docs/RELEASE_VERIFICATION.md` with artifact traceability, local/CI/database gates, configuration checks, backend/worker verification, physical-device evidence, critical journeys, and stop/rollback rules.
- Disabled iPad support for v1 pending deliberate device QA.

## Work in progress

- Validating the full Supabase migration/RLS/Storage/RPC suite from zero in a Docker-backed local stack or isolated project and regenerating/diffing database types.
- Completing provider-backed, signed-build, store-sandbox, and physical-device checks from `docs/RELEASE_VERIFICATION.md`.

## Owner or human intervention required

These items require the legal/billing/account owner or physical-device access. Do not put secret values in this file or source control.

- Apple Developer and App Store Connect enrollment, agreements, tax/banking, app record, consumable products, signing, and final submission.
- Google Play Console enrollment, verification, app record, consumable products, testing tracks, policy declarations, and final submission.
- Expo/EAS organization ownership, billing, project linking, and signing authorization.
- RevenueCat project/apps, store credential connections, public SDK keys, product/offering mapping, and webhook secret.
- Production/staging Supabase ownership, custom SMTP, CAPTCHA, backups/PITR, and secure server secrets.
- Dedicated OpenAI API project, billing/spend limits, model access, and server-only API key.
- Production privacy, terms, support, and web account-deletion URLs; legal approval of privacy/safety/retention wording.
- Final pricing/store territories, final icon and store assets, reviewed question sets/report rubric, and physical beta testers/devices.
- Enable RevenueCat webhook HMAC signing, set a random Authorization header, and enter both values only as Supabase Function secrets named `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_WEBHOOK_HMAC_SECRET`. Point the integration to the deployed `revenuecat-webhook` function.
- Enter the public RevenueCat SDK keys and final one-time product IDs in EAS environment variables. Keep RevenueCat secret API keys server-only.
- Add `thirtynights-dev://auth/callback`, `thirtynights-staging://auth/callback`, and `thirtynights://auth/callback` to the matching Supabase redirect allowlists; enable anonymous users and manual identity linking; enable/configure Apple and Google providers; configure CAPTCHA/rate limits; and set custom SMTP before beta.
- Deploy the report worker image with the variables in `worker/.env.example`; put `DATABASE_URL`, the Supabase service-role key, and the OpenAI key directly in the host secret manager.
- Publish and provide HTTPS privacy, terms, support, and web account-deletion pages. Configure their public URLs in EAS; the app deliberately refuses fake fallback legal pages.
- Apple-linked deletion still needs an approved token-revocation design/configuration and physical validation against the owner’s Apple credentials before launch.

## Verification log

- 2026-08-03: root TypeScript passed after route/service integration.
- 2026-08-03: Expo browser production export passed.
- 2026-08-03: report worker TypeScript check and production build passed.
- 2026-08-03: 20 app/domain/environment/worker contract tests passed.
- 2026-08-03: Expo Doctor passed 20/20 checks.
- 2026-08-03: isolated Expo prebuild produced both iOS and Android native projects; no exact-alarm permission was generated. Expo reports React Native 0.86.2 instead of its 0.86.0 recommendation, while Expo Doctor accepts the installed dependency set.
- 2026-08-03: dependency audit found zero high/critical issues and zero worker issues. Eleven moderate findings remain in Expo build-tooling dependencies through `xcode`/`uuid`; npm's proposed automatic remedy is an unsafe Expo SDK downgrade and was not applied.
- 2026-08-03: every forward migration executed successfully under `ON_ERROR_STOP` in a disposable PostgreSQL database with minimal Supabase Auth/Storage stubs; the temporary database and roles were removed afterward. This validates SQL/PLpgSQL execution but not hosted Supabase policy behavior.
- Pending: migration/RLS/Storage/RPC execution because Docker/Podman is not installed or running on this machine; generated database type diff; physical-device/store/provider testing.

## Security handoff rule

Share access by minimum-role invitations. Enter service-role keys, webhook secrets, OpenAI keys, store private keys, and service-account credentials directly into the relevant provider secret manager. Never place them in chat, screenshots, this document, `.env`, or Git.
