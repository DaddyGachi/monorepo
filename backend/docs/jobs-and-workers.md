# Scheduled jobs and workers

Inventory of the platform's background work, what healthy behaviour looks like, and
how to tell a job has stopped running. Source of truth for the table is
`JOB_INVENTORY` in [`src/jobs/jobObservability.ts`](../src/jobs/jobObservability.ts) —
the two are kept in step by `jobObservability.test.ts`.

## Inventory

| Job | Module | What it does | Expected interval | If it does not run | Healthy looks like |
| --- | --- | --- | --- | --- | --- |
| `late-payment-escalation` | `src/jobs/latePaymentJob.ts` | Walks active deals and applies the late-payment escalation matrix. | 6h (`LATE_PAYMENT_JOB_POLL_MS`) | Late tenants are never escalated; arrears accrue with no notice sent. | Completes in seconds. `recordsProcessed` is 0 on a day with no late deals — a *rising* count is the abnormal case. |
| `staking-finalizer` | `src/jobs/stakingFinalizer.ts` | Finalises staking for completed conversions (idempotent per conversion). | 10s | Completed conversions never finalise; staked balances stay invisible to the tenant. | Usually 0 processed. Sustained non-zero means conversions are backing up. |
| `data-retention` | `src/jobs/dataRetentionJob.ts` | Deletes stale onboarding drafts, anonymises KYC rejections, expires erasure requests. | 24h (`DATA_RETENTION_JOB_POLL_MS`) | Personal data retained past its policy window — a compliance breach, not a bug. | One run/day. Small non-zero counts are normal; a spike means a retention window changed. |
| `monthly-deduction-reminder` | `src/jobs/monthlyDeductionReminderJob.ts` | Sends advance salary-deduction notices to employer webhooks. | 24h (`MONTHLY_DEDUCTION_REMINDER_POLL_MS`) | Employers deduct without notice, or not at all — a missed rent cycle. | One run/day, non-zero only in the days before a pay cycle. |
| `scheduler` | `src/jobs/scheduler/worker.ts` | Leases and executes due rows in the job table (notifications, webhook delivery, purges). | 5s (`JOB_SCHEDULER_POLL_MS`) | Nothing queued ever executes: notifications, webhook deliveries and purges stall silently. | A tick every 5s; `recordsProcessed` = due rows claimed. Per-run detail: `GET /api/admin/jobs/{id}/history`. |

Other background loops not yet on the observed path (deliberately out of scope for
this change, listed so the gap is visible): `src/workers/dealStatusSyncWorker.ts`,
`src/workers/sorobanEventIndexer.ts`, the settlement outbox worker, and the
reconciliation pass. They keep their existing logging.

## What is recorded per run

`observeJobRun(name, fn)` wraps each run and records:

- **start** — `Job run started` log line with `job`, `startedAt`, `correlationId`
- **completion and duration** — `Job run completed` with `durationMs`
- **records processed** — `recordsProcessed`, returned by the job itself. This is the
  point of the whole exercise: a run that completed having processed zero records
  because of a query defect is indistinguishable from a healthy run in any log that
  only records completion.
- **failures** — `Job run failed` with the error message, `consecutiveFailures`, and
  the correlation id of the originating request when the run was triggered inside one
  (from `request-context.ts`, the same id used for HTTP request tracing).

## Detecting a job that stopped running

A missing run produces no error, so it has to be detected as an *absence*:

| Metric | Use |
| --- | --- |
| `job_seconds_since_last_run{job}` | Grows without bound once a job stops. `-1` = never ran this process. |
| `job_overdue{job}` | `1` when a job has not run within **twice** its expected interval, including never having run. This is the alerting signal. |
| `job_last_success_timestamp_seconds{job}` | Last *successful* run, for alerting on "runs but always fails". |
| `job_runs_total{job,status}` | `status` is `completed`, `failed`, or `skipped_overrun`. |
| `job_records_processed_total{job}` | Work actually done. Flat while `job_runs_total` climbs = running but doing nothing. |
| `job_run_duration_ms{job}` | Runs creeping toward the interval length predict overruns. |

Both gauges are computed at scrape time, so a stalled job keeps drifting instead of
freezing at its last reported value.

Suggested alert: `job_overdue == 1 for 10m`.

## Overrun behaviour

Deliberate, and enforced at two layers:

1. **In-process** — `observeJobRun` refuses to start a second run of the same job
   while one is still in flight and counts it as `job_runs_total{status="skipped_overrun"}`.
   Runs are skipped, never queued: these jobs are all "process whatever is due now",
   so a skipped run is fully recovered by the next one.
2. **Across processes** — scheduler-driven jobs are additionally serialised by the
   lease plus monotonic fencing token in `src/jobs/scheduler/store.ts`, so two
   instances cannot execute the same job row even mid-deploy.

A rising `skipped_overrun` count means a job is consistently overrunning its
interval and the interval (or the job) needs attention.

## Operator surface

- `GET /api/admin/jobs/health` — the full report above as JSON (`x-admin-secret`
  when `MANUAL_ADMIN_SECRET` is set).
- Admin UI: the **Background jobs** panel on `/admin/health`.
- `GET /metrics` — Prometheus, for alerting.
