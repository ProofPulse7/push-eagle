# Stay on Neon free tier (100 compute hours / month)

Push Eagle is designed so **30+ merchants** and **1M+ subscribers** can run on Neon’s free plan by moving high-volume data to Cloudflare D1 + KV and keeping Neon for control-plane data only.

## What stays on Neon (required)

- Merchants, campaigns, automation **rules**, segments, settings, billing, sessions
- `d1_audience_outbox` (durability buffer if D1 blips)
- Tiny rollups (`merchant_daily_stats`, `automation_rule_stats`)

## What moves off Neon (recommended)

| Data | Env | Saves |
|------|-----|--------|
| **Subscribers + tokens** | `D1_AUDIENCE_MODE=d1_only` | Largest transfer + storage win |
| Pixel / activity events | `D1_EVENTS_ENABLED=true` | High write volume |
| Delivery + click detail | `D1_DELIVERIES_ENABLED=true` | Grows with every send |
| **Automation jobs** | `D1_AUTOMATION_JOBS_ENABLED=true` | High-frequency polling table removed from Neon |
| **Opt-in stats** | `D1_OPT_IN_STATS_ENABLED=true` | Beacon writes no longer touch Neon |
| Orders / fulfillments | `D1_COMMERCE_ENABLED=true` | Webhook-heavy |
| Customers / catalog | `D1_CUSTOMERS_ENABLED`, `D1_CATALOG_ENABLED` | Cache tables |
| Webhook dedup | KV namespace | Every webhook hit |
| Cron idle probe | KV cache **4h** | Idle ticks skip Neon |
| Schema DDL | KV `pe:schema:ready:v7` | Skip ~40 DDL on cold start |

## Neon project compute settings (dashboard)

These matter as much as code for free-plan CU:

1. Open the **existing** compute (not only “Change default compute settings”).
2. Set **Min = 0.25 CU** and **Max = 0.25 CU** (or Max **0.5** if sends feel slow).
3. Enable **Scale to zero** / autosuspend with the **shortest** idle delay available (often **1–5 minutes**).
4. Remember: changing **defaults** does **not** change the live primary — edit the running endpoint too.
5. Keep **one** primary compute; avoid extra read replicas on free plan.

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

### 7. Reclaim Neon storage (required after cutover)

After D1 parity (`D1` counts ≥ Neon) and stable `d1_only`:

```bash
# Inventory
curl ".../api/admin/neon/drop-legacy-tables" -H "X-Cron-Secret: $CRON_SECRET"

# Empty migrated tables
curl -X POST ".../api/admin/neon/drop-legacy-tables" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"drop"}'

# Audience tables with stale Neon rows after confirmed D1 has more data:
curl -X POST ".../api/admin/neon/drop-legacy-tables" \
  -H "X-Cron-Secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"force-drop"}'
```

Or locally (with env flags set):

```bash
node scripts/drop-neon-legacy-tables.mjs --confirm
node scripts/drop-neon-legacy-tables.mjs --confirm --force   # audience only after D1 parity
```

`ensureSchema()` skips creating these tables when the matching D1/KV flag is on
(`pe:schema:ready:v6`), so dropped tables do **not** come back.

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
D1_AUTOMATION_JOBS_ENABLED=true   # direct cutover — no pending jobs needed on Neon
D1_OPT_IN_STATS_ENABLED=true      # opt-in beacon writes removed from Neon
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
| Automation jobs | `D1_AUTOMATION_JOBS_ENABLED=false` (historical Neon rows stay untouched) |
| Opt-in stats | `D1_OPT_IN_STATS_ENABLED=false` |

## Expected Neon usage after cutover

- Token registration: **0** Neon audience writes
- Campaign send: audience read from **D1** (not millions of Neon rows)
- Dashboard subscriber KPIs: **D1** counts
- Cron idle: KV-cached probe, 1h sleep when no work
- Cold starts: schema sync skipped up to 24h via KV

Target: **well under 100 compute hours/month** at 30 merchants / 1M subscribers, assuming KV + worker cron are configured.
