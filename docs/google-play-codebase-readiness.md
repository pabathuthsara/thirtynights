# Thirty Nights — Google Play Codebase Readiness

Last updated: 2026-08-18

This tracker complements the publication readiness audit. It records codebase work that can be completed before the Google Play Console account and store products are available.

## Implementation status

| # | Work item | Status | Notes |
|---|---|---|---|
| 1 | Disable unnecessary Expo Audio background playback and recording services. | Complete | Set both Expo Audio background flags to `false`; foreground microphone recording remains enabled. |
| 2 | Explicitly block `android.permission.SYSTEM_ALERT_WINDOW` from Android builds. | Complete | Added `android.blockedPermissions` and a generated-manifest regression check. |
| 3 | Pin local development to Node.js 22 to match CI. | Complete | Added `.nvmrc`, `.node-version`, and `package.json` engine metadata. CI already uses Node 22. |
| 4 | Align Expo dependency patch versions and rerun Expo Doctor. | Complete | Updated all 10 reported SDK 57 patch mismatches; Expo Doctor now passes 21/21 checks. |
| 5 | Add an index on `private.processing_consent_events(user_id)`. | Complete | Added and deployed migration `20260818093743`; verified the hosted B-tree index and added a pgTAP contract assertion. |
| 6 | Strengthen CI release checks. | Complete | CI now generates and inspects a production Android native project, exports its Android bundle, runs the existing checks, tests/lint, and explicitly lists local migration history. |
| 7 | Add automated coverage for immediate email/password signup and password recovery. | Complete | Added mocked Supabase lifecycle tests for immediate session creation, redirect-bound recovery, fail-closed transitions, and stable user identity. |
| 8 | Add worker monitoring for stale jobs and repeated processing failures. | Deployed; destination pending | Queue monitoring and its thresholds are live on Railway deployment `017021d9`; the queue is healthy. A production HTTPS alert webhook must still be supplied. |
| 9 | Review `SECURITY DEFINER` database functions and add authorization regression tests. | Complete | All 23 authorization checks pass against hosted Supabase; the run found and fixed the `retry_report` conflict-target ambiguity in deployed migration `20260818113403`. |
| 10 | Add hosted privacy, terms, support, and account-deletion pages and replace placeholder URLs. | Pending | Requires final public URLs and hosting. |
| 11 | Produce the Google Play asset and listing package. | Pending | 512×512 icon, 1024×500 feature graphic, production screenshots, listing copy, and release notes. |
| 12 | Clean and commit the working tree before creating a release candidate. | Complete | Verified work was committed and pushed as `85426f3`; the working tree is clean. |

## Verification record

### Android production configuration

- Added `enableBackgroundPlayback: false` and `enableBackgroundRecording: false` to the `expo-audio` plugin configuration.
- Added `android.permission.SYSTEM_ALERT_WINDOW` to `android.blockedPermissions`.
- Added `scripts/verify-android-production.mjs`. It creates a temporary production native project and checks that:
  - `RECORD_AUDIO` and `VIBRATE` remain available.
  - `SYSTEM_ALERT_WINDOW` has a manifest removal directive.
  - Foreground-service permissions are absent.
  - Expo Audio playback and recording services are absent.
  - The application ID is `com.thirtynights.app`.
  - A production Android JavaScript bundle can be exported.
- `npm run verify:android:production`: passed.

### Runtime and Expo dependencies

- Repository runtime is pinned to Node.js 22. The verification shell was still running Node.js 25, so it correctly produced an `EBADENGINE` warning after the pin; developers should run `nvm use` before release work.
- Expo SDK patch versions resolved in `package-lock.json`:
  - `@expo/metro-runtime` 57.0.11
  - `expo` 57.0.14
  - `expo-asset` 57.0.12
  - `expo-auth-session` 57.0.7
  - `expo-constants` 57.0.12
  - `expo-dev-client` 57.0.13
  - `expo-file-system` 57.0.4
  - `expo-notifications` 57.0.12
  - `expo-sharing` 57.0.13
  - `expo-splash-screen` 57.0.7
- `npm run doctor`: passed 21/21 checks.

### Supabase migration

- Created `supabase/migrations/20260818093743_add_processing_consent_events_user_index.sql`.
- Applied the migration to the hosted `thirtynights` Supabase project.
- Queried `pg_indexes` and confirmed `processing_consent_events_user_id_idx` is a B-tree index on `private.processing_consent_events(user_id)`.
- Confirmed the hosted migration history contains version `20260818093743`.
- Added a pgTAP `has_index` assertion to `production_contract.test.sql` and increased its plan from 42 to 43 assertions.
- Local database reset/lint/pgTAP execution could not run on this workstation because Docker and Podman are not installed. The hosted schema was verified directly, and CI retains the full local Supabase reset, lint, and database test workflow.
- After the authorization migration, hosted security and performance advisors reported no warning- or error-level issues.

### CI and repository checks

- CI now runs `npm run verify:android:production` after Expo Doctor.
- The database CI job now lists local migration history after reset, lint, and pgTAP tests.
- `npm run check`: passed after the readiness fixes.
  - TypeScript passed.
  - 16 test files and 113 tests passed.
  - Worker TypeScript validation passed.
  - Web export passed.
- `git diff --check`: passed.

### Authentication lifecycle coverage

- Added tests for immediate anonymous-to-email/password conversion that assert
  a refreshed permanent session and preservation of the original user UUID.
- Added an end-to-end mocked password-recovery lifecycle covering the
  device-bound redirect, `PASSWORD_RECOVERY` transition, fail-closed interim
  auth state, password update, refreshed authenticated session, and stable UUID.
- Completing recovery now publishes the cleared recovery state to subscribers.

### Worker monitoring

- The worker now checks `private.report_jobs` every minute for jobs overdue by
  45 minutes, retrying jobs reaching three attempts inside a one-hour window,
  and any finally failed job.
- Alert events are rate-limited to a 30-minute cooldown and include both
  `firing` and `resolved` transitions.
- `WORKER_ALERT_WEBHOOK_URL` accepts an HTTPS production alert destination;
  `/healthz` exposes queue-monitor, webhook-configuration, and delivery state.
- Thresholds, cadence, and the destination are documented in
  `worker/.env.example` and the Railway handoff.
- Commit `85426f3` is deployed to Railway production as deployment
  `017021d9-cd01-44a3-9753-29ee0eb061a1`. The health check passed in Singapore
  with one replica, and the hosted queue currently reports zero stale jobs and
  zero repeated/final failures.
- The runtime confirms `WORKER_ALERT_WEBHOOK_URL` is not configured. Supplying
  that external destination remains required for human notification delivery.

### Database authorization review

- Added `authorization_contract.test.sql` with 23 pgTAP assertions.
- The suite verifies fixed `search_path` settings, no anonymous access to
  privileged functions, no authenticated access to private/server-only
  helpers, owner-scoped scheduling/consent/reconciliation, and rejected
  cross-user report retries.
- The hosted project does not keep pgTAP installed, so verification loaded it
  only inside a rollback-only transaction. All 23 checks passed and no test
  identities or extension objects persisted.
- The first hosted run exposed an ambiguous `on conflict (report_id)` inside
  `retry_report`. Migration `20260818113403` now targets the named unique
  constraint, is recorded in hosted migration history, and passed the owner and
  cross-user retry tests.

## Known release check still failing

`npm run audit:release` still blocks release with 12 high and 9 moderate transitive vulnerabilities in the Expo/Metro/React Native toolchain. npm's suggested forced fixes would install breaking, incompatible framework versions, so they were not applied as part of the SDK-compatible patch update. This remains a separate dependency-security task.
