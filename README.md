# Thirty Nights

Production-oriented Expo app for a local-first, time-locked voice journal. One eligible question opens per expected local date. A released take is durably sealed before any network work; cloud grants, purchases, report readiness, reveal, and refunds remain server-authoritative.

## Local development

Requirements: Node 22+, npm, and an Expo development build for native SQLite, RevenueCat, notifications, secure storage, and audio behavior.

```bash
npm ci
npm ci --prefix worker
cp .env.example .env.local
npm start
```

The browser build is a useful UI/offline preview, but billing and native-device behavior require an iOS/Android development build. Placeholder provider values keep cloud features disabled; production code never substitutes fake prices or local paid grants.

## Verification

```bash
npm run typecheck
npm test
npm run worker:check
npm run doctor
npm run audit:release
npm run export:web
```

Database contract verification requires Docker Desktop or Podman:

```bash
npm run db:start
npm run db:verify
npm run db:stop
```

`db:verify` resets the isolated local stack, applies every migration from zero, runs database linting, and executes the pgTAP contract suite. Never point it at staging or production.

Apply Supabase migrations only to an isolated staging branch/project first. Deploy `revenuecat-webhook` and `delete-account` from `supabase/functions`, then deploy the continuously running Node 22 image in `worker/` with server-only secrets.

## Native builds

```bash
npx eas-cli device:create
npx eas-cli build --platform ios --profile development
npx eas-cli build --platform android --profile development
npx expo start --dev-client
```

The account owner must link the EAS project, authorize signing, configure stores/providers, publish legal pages, and complete physical-device/store testing. See `docs/HANDOVER.md` for the live implementation and owner-action record.
