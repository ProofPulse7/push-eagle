# Cost optimization deployment

Target: **30 merchants**, **1M subscriber tokens**, all automations + tracking on **Neon free + Vercel free + Cloudflare Workers $5/mo**.

## Neon network transfer (critical for free 5 GB/mo)

Code now **stops reading/writing Neon** for data that already lives on D1:

| Change | Impact |
|--------|--------|
| Cart product list = D1-only when `D1_EVENTS_ENABLED` | Stops dual Neon+D1 reads on every cart reminder |
| Activity / checkout skip checks = D1-only | No empty Neon `subscriber_activity_events` scans |
| Product image = D1-only when `D1_CATALOG_ENABLED` | No Neon catalog fallback after D1 miss |
| Orders-create identity = D1 tracking | No 30-day Neon pixel/activity UNION scans |
| Skip Neon pixel archive when D1 events on | No wide `SELECT * FROM pixel_events` every 6h |
| Skip Neon activity/commerce/delivery deletes when D1 owns them | Retention no longer scans empty Neon tables |
| `getRuleConfig` 60s in-process cache | Fewer `automation_rules` round-trips |
| Collection flags TTL 2m / KV 10m | Fewer rule-enabled Neon reads |
| Cron probe idle cache 15m | Fewer COUNT probes while idle |
| Audience outbox empty cache 5m | Cron tick skips Neon outbox SELECT when empty |
| `d1_only` audience: no Neon empty/error fallback | Stops stale Neon audience transfer |
| Diagnostic API requires `CRON_SECRET` | Prevents accidental heavy Neon scans |

**Required production flags (already set on Vercel):**

```
D1_AUDIENCE_MODE=d1_only
D1_EVENTS_ENABLED=true
D1_DELIVERIES_ENABLED=true
D1_COMMERCE_ENABLED=true
D1_CUSTOMERS_ENABLED=true
D1_CATALOG_ENABLED=true
CLOUDFLARE_KV_NAMESPACE_ID=...
CLOUDFLARE_WORKER_URL=...
AUTOMATION_QUEUE_ENABLED=true
```

Neon should mainly hold: `merchants`, `automation_rules`, `automation_jobs`, `campaigns`, billing, segments, media refs — not high-volume events/audience/deliveries.

## What changed (code)

| Change | Impact |
|--------|--------|
| **D1 direct pixel ingest** | Storefront pixel events skip Neon `ingestion_jobs` when D1 is enabled |
| **KV event throttle** | Dedupes page_view / product_view / cart events per visitor |
| **No inline automation on page views** | Bootstrap/activity no longer run `processDueAutomationJobsForShop` when queue is enabled |
| **KV merchant host cache** | Storefront CORS auth avoids repeated Neon `merchants` lookups |
| **KV cron probe cache** | Idle ticks reuse probe result (fewer COUNT queries) |
| **Cron idle sleep** | Worker skips ticks for up to ~60 min when no work (needs KV) |
| **Removed analytics page load** | Dashboard bootstrap no longer loads heavy analytics stats |
| **All 6 automations unlocked** | `COMING_SOON_AUTOMATIONS_ENABLED=false` |

## Phase 0 (deployed in code)

| Change | Impact |
|--------|--------|
| **Consolidated `/api/cron/tick`** | 1 Vercel invocation/min instead of 16. Same 1-minute cadence for automations. |
| **Slim bootstrap** | Removed analytics, automations overview, and subscriber breakdown from initial load. Pages fetch on demand. |
| **Bootstrap cache (45s)** | In-process cache on warm serverless instances reduces duplicate Neon reads. |
| **Segment `estimated_subscriber_count`** | Bootstrap and list views avoid N+1 audience resolution. Full refresh when stale (>1h) or on segment save. |
| **Retention maintenance** | Prunes processed ingestion jobs (7d), cron heartbeats (7d). Runs once per tick. |
| **`merchant_daily_stats` rollups** | Populated nightly at 03:00 UTC for dashboard analytics (future fast reads). |
| **Async campaign send** | POST `/api/campaigns/send` returns immediately; delivery continues via `waitUntil`. |
| **Frontend polling** | Bootstrap refresh 15m + focus/visibility only. Campaign stats poll only while sending (30s). |

## Phase 1 (event-driven + edge cache)

| Change | Impact |
|--------|--------|
| **Cloudflare Queues** | Short-delay automation jobs (≤12h) fire via queue instead of DB polling. Cron remains a safety net. |
| **Cloudflare KV** | Cross-instance bootstrap + analytics cache (120s / 180s TTL). |
| **R2 pixel archive** | Events older than 14 days move to `pixel-archive/` in R2, then delete from Neon. Automations keep 14-day hot window. |

### How automation queues work

1. `enqueueAutomationJob` inserts into Neon (source of truth) and calls the worker `/internal/enqueue-automation`.
2. Worker sends a delayed message to `push-eagle-automation-jobs`.
3. At due time, queue consumer calls `POST /api/cron/process-automation-job`.
4. Jobs with delays **> 12 hours** stay DB-only until the cron tick promotes them into the queue window.
5. Cron still scans due jobs after a **90-second grace period** if the queue message was missed.

**Timing accuracy:** 1m / 3m / 5m reminders use queue delay seconds, not slower cron intervals.

---

## Deploy order

### Step 1 — Dashboard (Vercel)

Deploy `push-eagle-dashboard` with Phase 0 + Phase 1 code.

### Step 2 — Cloudflare resources

```bash
cd shopify-webpush-app/cloudflare-cron

# Queue + DLQ (required for Phase 1 worker)
npx wrangler queues create push-eagle-automation-jobs
npx wrangler queues create push-eagle-automation-jobs-dlq

# KV namespace for dashboard cache (optional but recommended)
npx wrangler kv namespace create DASHBOARD_CACHE
# Copy the returned id into Vercel CLOUDFLARE_KV_NAMESPACE_ID

npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

Note the worker URL after deploy (e.g. `https://push-eagle-cron-pinger.<account>.workers.dev`).

### Step 3 — Vercel env vars

**Required (unchanged):**

```
NEON_DATABASE_URL=postgresql://...
CRON_SECRET=<same as Cloudflare worker>
```

**Phase 1 — automation queue (enable after worker deploy):**

```
AUTOMATION_QUEUE_ENABLED=true
CLOUDFLARE_WORKER_URL=https://push-eagle-cron-pinger.<account>.workers.dev
```

**Phase 1 — KV cache (optional):**

```
CLOUDFLARE_ACCOUNT_ID=<cloudflare account id>
CLOUDFLARE_API_TOKEN=<token with Workers KV Storage Edit>
CLOUDFLARE_KV_NAMESPACE_ID=<namespace id from wrangler kv namespace create>
```

Create API token: Cloudflare Dashboard → My Profile → API Tokens → Edit Cloudflare Workers → include **Account.Workers KV Storage Edit**.

**Phase 1 — R2 pixel archive (optional, uses existing R2 bucket):**

```
R2_ACCOUNT_ID=
R2_BUCKET_NAME=
R2_S3_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Archives land under `pixel-archive/{shop}/{date}-{batch}.jsonl.gz`. If R2 is not configured, old pixel rows are still deleted from Neon during retention (same as before, without archive).

---

## Cloudflare worker bindings

| Binding | Queue / resource |
|---------|------------------|
| `AUTOMATION_QUEUE` | `push-eagle-automation-jobs` (producer + consumer) |
| DLQ | `push-eagle-automation-jobs-dlq` |

Worker HTTP routes:

| Route | Purpose |
|-------|---------|
| `POST /internal/enqueue-automation` | Schedule delayed job (`{ jobId, delaySeconds }`) |
| `GET /` (default fetch) | Manual cron tick trigger |
| `scheduled` | Every-minute cron tick |

---

## Feature classification (recommended)

| Feature | Status | Rationale |
|---------|--------|-----------|
| Subscribers, tokens, opt-in | **KEEP** | Core product |
| Segments, campaigns, automations | **KEEP** | Core product |
| Campaign/automation stats, revenue | **KEEP** | Essential metrics |
| Merchant settings | **KEEP** | Required |
| Analytics page (30-day charts) | **KEEP** | Loads via own API; KV cached |
| Automations diagnostic pages | **DISABLE BY DEFAULT** | High debug cost; gate behind admin flag |
| Genkit smart send / AI flows | **MOVE TO PAID** | Optional; adds cold-start + external API cost |
| Flash sale urgency UI | **KEEP** | Low cost; no extra cron |
| Pixel events (14d hot in Neon) | **KEEP** | Needed for cart/browse automations; older rows in R2 |

---

## Verification checklist

- [ ] `cron_heartbeats` shows `cron_tick` every minute
- [ ] Abandoned cart reminders fire at configured delays (test with 1m / 3m / 5m)
- [ ] Queue consumer logs show `process-automation-job` calls at due times
- [ ] Manual campaign send returns instantly and completes in background
- [ ] Bootstrap loads fast on repeat visits (KV hit in logs if configured)
- [ ] Analytics page loads; repeat date-range requests hit KV
- [ ] R2 bucket shows `pixel-archive/` objects after retention runs (if R2 configured)

---

## Rollback

Set `AUTOMATION_QUEUE_ENABLED=false` on Vercel. Automations fall back to cron-only polling (Phase 0 behavior). KV and R2 are optional — unset env vars to disable.
