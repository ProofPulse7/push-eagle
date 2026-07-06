# Stay on Neon free tier (100 compute hours / month)

Push Eagle is designed so **30+ merchants** and **1M+ subscribers** can run on Neon’s free plan by moving high-volume data to Cloudflare D1 + KV and keeping Neon for control-plane data only.

## What stays on Neon (required)

- Merchants, campaigns, automations, segments, settings, billing
- Automation/campaign job queues
- `d1_audience_outbox` (durability buffer if D1 blips)
- Tiny rollups (`merchant_daily_stats`, `opt_in_prompt_stats`)

## What moves off Neon (recommended)

| Data | Env | Saves |
|------|-----|--------|
| **Subscribers + tokens** | `D1_AUDIENCE_MODE=d1_only` | Largest transfer + storage win |
| Pixel / activity events | `D1_EVENTS_ENABLED=true` | High write volume |
| Delivery + click detail | `D1_DELIVERIES_ENABLED=true` | Grows with every send |
| Orders / fulfillments | `D1_COMMERCE_ENABLED=true` | Webhook-heavy |
| Customers / catalog | `D1_CUSTOMERS_ENABLED`, `D1_CATALOG_ENABLED` | Cache tables |
| Webhook dedup | KV namespace | Every webhook hit |
| Cron idle probe | KV cache (built-in) | 1 query/min → ~1/5 min when idle |
| Schema DDL | KV `pe:schema:ready:v5` | Skip ~40 DDL on cold start |

## Audience migration (subscribers → D1)

**Do not skip steps.** Wrong order loses subscribers or doubles writes.

### 1. Provision D1 audience database

```bash
cd shopify-webpush-app/cloudflare-cron
npx wrangler d1 create push-eagle-audience
```

Set on Vercel:

- `CLOUDFLARE_D1_AUDIENCE_DATABASE_ID=<uuid>`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

### 2. Dual-write (build D1 copy)

```
D1_AUDIENCE_MODE=dual_write
```

Redeploy. New opt-ins mirror to D1 automatically.

### 3. Backfill existing rows

```bash
curl -X POST "https://push-eagle-dashboard.vercel.app/api/admin/audience/backfill-d1" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 500, "maxBatches": 200}'
```

Repeat with returned `afterSubscriberId` / `afterTokenId` cursors until `done: true`.

Verify:

```bash
curl "https://push-eagle-dashboard.vercel.app/api/admin/audience/backfill-d1" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

`inSync: true` for each shop (or globally).

### 4. Self-test authoritative writes

```bash
curl -X POST ".../api/admin/audience/backfill-d1" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action": "selftest"}'
```

### 5. Read cutover (optional validation)

```
D1_AUDIENCE_MODE=read
```

Reads use D1; Neon still dual-writes (hot standby). Monitor logs for `[d1-audience] shadow mismatch`.

### 6. Final cutover

```
D1_AUDIENCE_MODE=d1_only
```

- All subscriber/token **writes** go only to D1
- Neon audience tables stop updating (stale but harmless)
- `ensureSchema` skips audience DDL + expensive dedup scans on Neon

### 7. Reclaim Neon storage (optional)

After parity and stable `d1_only`:

```bash
curl -X POST ".../api/admin/neon/drop-legacy-tables" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -d '{"dryRun": true}'
```

Then `dryRun: false` when `eligibleToDrop` for audience tables.

## Full production env (cost-optimized)

```env
# KV + cron
CLOUDFLARE_KV_NAMESPACE_ID=...
CLOUDFLARE_WORKER_URL=...
CRON_SECRET=...
AUTOMATION_QUEUE_ENABLED=true

# D1 databases
CLOUDFLARE_D1_DATABASE_ID=...           # commerce/customers/catalog
CLOUDFLARE_D1_AUDIENCE_DATABASE_ID=...  # subscribers + tokens
CLOUDFLARE_D1_EVENTS_DATABASE_ID=...    # pixel + activity
CLOUDFLARE_D1_DELIVERIES_DATABASE_ID=... # delivery detail

D1_AUDIENCE_MODE=d1_only
D1_EVENTS_ENABLED=true
D1_DELIVERIES_ENABLED=true
D1_COMMERCE_ENABLED=true
D1_CUSTOMERS_ENABLED=true
D1_CATALOG_ENABLED=true
```

Backfill each layer before enabling its flag (see `ZERO-COST-DEPLOY.md`).

## Rollback

| Layer | Rollback |
|-------|----------|
| Audience | `D1_AUDIENCE_MODE=read` or `dual_write` (Neon still has historical rows until `d1_only` ran a long time) |
| Events | `D1_EVENTS_ENABLED=false` |
| Deliveries | `D1_DELIVERIES_ENABLED=false` |

## Expected Neon usage after cutover

- Token registration: **0** Neon audience writes
- Campaign send: audience read from **D1** (not millions of Neon rows)
- Dashboard subscriber KPIs: **D1** counts
- Cron idle: KV-cached probe, 1h sleep when no work
- Cold starts: schema sync skipped up to 24h via KV

Target: **well under 100 compute hours/month** at 30 merchants / 1M subscribers, assuming KV + worker cron are configured.
