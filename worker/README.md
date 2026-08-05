# Report worker

Durable Node 22 worker for private Storage downloads, checksum verification, timestamped transcription, strict evidence-grounded report generation, quote validation, ffmpeg clip assembly, and immutable report upload.

Copy `.env.example` into the host secret manager, install with `npm ci`, run `npm run check`, then deploy the Docker image as one or more continuously running instances. The database role in `DATABASE_URL` must be a least-privilege server role able to lease `private.report_jobs`, read owned report inputs, insert transcript segments, and publish report results. Never expose these values to Expo.
