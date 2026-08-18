# Railway deployment handover

## Objective

Deploy the Thirty Nights report worker from `worker/` to Railway so transcription, report generation, and report-audio assembly no longer depend on the developer laptop.

The mobile app does **not** call this worker directly. The production flow is:

```text
iPhone app -> Supabase Auth / Database / Storage
Railway worker -> Supabase report_jobs / recordings -> OpenAI -> Supabase reports / report-audio
```

Metro/Expo on the laptop is unrelated to this deployment and is only needed for development builds.

## User intent and recommended target

The user explicitly wants to deploy the worker to Railway now for easier development and to keep the same host for early production.

- Railway project: `thirtynights`
- Service: `report-worker`
- Environment: `production`
- Source repository: `pabathuthsara/thirtynights`
- Branch: `main`
- Build root: `/worker`
- Runtime: the existing multi-stage `worker/Dockerfile`
- Region: Singapore
- Replicas: 1
- Sleep/serverless mode: disabled; this is a continuously polling worker
- Suggested limit: 1 vCPU and 1 GB RAM
- Persistent volume: none; FFmpeg uses temporary files and cleans them up
- Health check: `GET /healthz`
- Restart policy: always
- Expected initial plan: Railway Hobby, currently a $5 minimum monthly usage commitment. Do not authorize a new paid plan or unexpected upgrade without the user's confirmation.

Singapore is the closest Railway region to the current Supabase project, which is in AWS Tokyo (`ap-northeast-1`).

## Repository state at handover

- Workspace: `/Users/pabath/Documents/thirtynights`
- Git remote: `https://github.com/pabathuthsara/thirtynights.git`
- Branch: `main`
- `main` is synchronized with `thirtynights/main`.
- Handover baseline commit: `f40dd14`
- The tree was clean before this handover file was added.
- Worker Dockerfile: `worker/Dockerfile`
- Worker entry point: `worker/src/index.ts`
- Worker health server binds Railway's injected `PORT`, falling back to `WORKER_HEALTH_PORT`/`8080`.
- Both `/healthz` and `/health` are supported.
- Docker includes Node 22, FFmpeg, CA certificates, a container health check, and runs as the non-root `node` user.
- The worker leases one database job at a time using `FOR UPDATE ... SKIP LOCKED`, retries failures, and publishes completed report data/audio to Supabase.

Run this before deployment and do not continue on failure:

```bash
npm run check
```

## Railway plugin

The Railway plugin is installed and linked, but it was installed after the current Codex session began and its callable tools were not exposed to that session. Start a fresh Codex session if necessary, invoke the installed `use-railway` skill, and use the Railway connector rather than browser automation.

Confirmed Railway connector capabilities include:

- `railway.whoami`
- `railway.list-workspaces`
- `railway.list-projects`
- `railway.create-project`
- `railway.create-deployment`
- `railway.list-services`
- `railway.update-service`
- `railway.get-service-config`
- `railway.set-variables`
- `railway.get-status`
- `railway.list-deployments`
- `railway.get-logs`
- `railway.get-service-metrics`
- `railway.redeploy`
- `railway.railway-agent`
- `railway.accept-deploy`

Start with `railway.whoami` and `railway.list-projects`. Reuse a suitable existing `thirtynights` project if one already exists; do not create duplicates.

## Deployment sequence

1. Invoke `use-railway` and read its instructions completely.
2. Call `railway.whoami`, `railway.list-workspaces`, and `railway.list-projects`.
3. If necessary, create a private `thirtynights` project in the user's personal workspace.
4. Deploy the confirmed GitHub source:
   - repo: `pabathuthsara/thirtynights`
   - branch: `main`
   - service name: `report-worker`
5. Configure the service immediately:
   - `rootDirectory: /worker`
   - let Railway auto-detect `worker/Dockerfile`; if it does not, explicitly point it at `/worker/Dockerfile`
   - `healthcheckPath: /healthz`
   - `sleepApplication: false`
   - `cronSchedule: null`
   - `restartPolicyType: ALWAYS`
   - watch only `worker/**` where supported
6. Use `railway.railway-agent` if needed to set Singapore, one replica, and the suggested 1-vCPU/1-GB limits because those fields are not exposed by `railway.update-service`.
7. Set variables with `skipDeploys: true`, then trigger one intentional deployment after configuration is complete. The first automatic GitHub deployment might fail before the root directory and secrets are set; that is recoverable.
8. Follow the deployment using `railway.get-status`, `railway.list-deployments`, and `railway.get-logs` until it is healthy.

`railway.accept-deploy` is marked destructive. Use it only for the deployment the user explicitly requested, after reviewing the staged service/configuration and ensuring no unrelated Railway services will be changed.

## Required Railway secrets

Use the existing ignored `worker/.env` as the source for the current development values. Never paste secret values into this document, source control, logs, commentary, or the mobile application's Expo environment.

Required:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
```

Explicit runtime configuration:

```text
NODE_ENV=production
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe-diarize
OPENAI_REPORT_MODEL=<copy the currently working value from worker/.env>
REPORT_PROMPT_VERSION=2026-08-v2
REPORT_SCHEMA_VERSION=v2
WORKER_POLL_MS=5000
FFMPEG_PATH=ffmpeg
STORAGE_TIMEOUT_MS=120000
TRANSCRIPTION_TIMEOUT_MS=300000
ANALYSIS_TIMEOUT_MS=300000
WORKER_MONITOR_INTERVAL_MS=60000
WORKER_STALE_JOB_MINUTES=45
WORKER_FAILURE_ATTEMPTS=3
WORKER_FAILURE_WINDOW_MINUTES=60
WORKER_ALERT_COOLDOWN_MINUTES=30
WORKER_ALERT_WEBHOOK_URL=<HTTPS alert ingestion endpoint>
```

Do not set `PORT`; Railway should inject it.

Important: `worker/.env.example` still shows v1 report versions, while the worker code and current live reports use v2. Use the v2 values above and update the example separately if authorized.

The database connection must include TLS (`sslmode=require`) and use the current Supabase shared pooler/server connection. Do not put `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, or `OPENAI_API_KEY` into `EXPO_PUBLIC_*` variables.

## Security

The current OpenAI key, Supabase service-role key, and database password were previously shared in conversation. They can be used only as a temporary development bridge if the user still wants that, but all three must be rotated before public production. After rotation, update Railway secrets and the local ignored environment; never commit the replacements.

Do not expose a public Railway domain unless it is needed for manual health verification. The worker has no public application API and only needs outbound access to Supabase/OpenAI. If a domain is generated, it should expose only the health endpoint behavior already implemented.

## Verification checklist

Deployment is complete only when all of the following are true:

- Railway reports a successful, active deployment.
- Runtime logs contain `worker_health_listening` with Railway's assigned port.
- `/healthz` returns HTTP 200 and JSON with `status: "ok"`.
- `/healthz` reports `queueMonitor.status` and confirms
  `alertWebhookConfigured: true`.
- There are no startup errors for missing variables, database TLS, FFmpeg, or OpenAI model IDs.
- Railway metrics show the process remains alive while idle.
- The service is in Singapore, has exactly one replica, and application sleeping is disabled.
- No worker remains running locally against the same production database. Check port 8080/processes and stop only the known local worker if present.
- The iPhone app continues to sync through Supabase; no client URL change should be required.

Do not requeue an existing private report or create a paid OpenAI test job merely to prove deployment unless the user approves that mutation and cost. If a naturally queued report exists, observe it. Otherwise, health, database connectivity in logs, and a clean idle polling loop are sufficient for initial infrastructure verification.

## Expected logs and failure diagnosis

Healthy startup:

```text
worker_health_listening { port: <Railway PORT> }
```

`worker_alert_webhook_unconfigured` means the service can still process jobs,
but stale-job and repeated-failure alerts have nowhere to go. Set the HTTPS
webhook before treating the deployment as production-ready.

Common failures:

- `DATABASE_URL is required` or similar: Railway variables were not applied to the service/environment.
- Database connection/TLS error: verify the percent-encoded password, pooler hostname, and `sslmode=require`.
- `ffmpeg` spawn error: confirm Railway built `worker/Dockerfile`, not the repository root with another builder.
- `report_analysis_404`: the configured report model ID is unavailable; verify the account's working API model and copy the known-good local value rather than guessing.
- Health check 404: configure `/healthz` exactly.
- Service repeatedly stops while idle: disable application sleeping and cron mode; this worker must run continuously.
- Build cannot find `package.json`: root directory is wrong; it must be `/worker`.

## Development workflow after deployment

- Treat Railway production as the default always-on worker.
- GitHub changes under `worker/**` may auto-deploy after checks pass.
- Do not casually run the local worker against the same Supabase database; `SKIP LOCKED` prevents duplicate leasing, but it makes debugging unpredictable because either worker may claim a job.
- For a local worker debugging session, temporarily stop/scale down the Railway worker or use a separate development Supabase environment.
- As usage grows, this design can safely add replicas because job leasing uses `SKIP LOCKED`, but scaling should be driven by queue latency and Railway metrics, not enabled preemptively.

## Definition of done

The task is done when the Docker worker is continuously healthy on Railway Singapore, all required secrets are stored only in Railway's secret manager, the production Supabase queue can be polled without errors, the laptop worker is no longer required, and the exact Railway project/service IDs and deployment URL or status are reported back to the user.
