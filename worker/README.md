# Report worker

Durable Node 22 worker for private Storage downloads, checksum verification, timestamped transcription, strict evidence-grounded report generation, quote validation, ffmpeg clip assembly, and immutable report upload.

Copy `.env.example` into the host secret manager, install with `npm ci`, run `npm run check`, then deploy the Docker image as one or more continuously running instances. The database role in `DATABASE_URL` must be a least-privilege server role able to lease `private.report_jobs`, read owned report inputs, insert transcript segments, and publish report results. Never expose these values to Expo.

## Queue monitoring

The worker inspects `private.report_jobs` every minute. It raises a structured
alert when an eligible job has remained stale for 45 minutes, a retrying job
reaches three processing failures within the last hour, or a job is finally
failed. A recovery event is
sent when the queue returns to normal, and repeated firing alerts are limited
to once every 30 minutes.

Set `WORKER_ALERT_WEBHOOK_URL` to an HTTPS endpoint in the production host
secret manager. The endpoint receives JSON with the event status, thresholds,
and queue counts. When the URL is omitted, the same event is written as
`worker_alert_webhook_unconfigured`; `/healthz` also reports queue-monitor and
alert-delivery state. Thresholds and cadence can be changed with the documented
`WORKER_MONITOR_*`, `WORKER_STALE_*`, `WORKER_FAILURE_*`, and
`WORKER_ALERT_COOLDOWN_MINUTES` variables in `.env.example`.
