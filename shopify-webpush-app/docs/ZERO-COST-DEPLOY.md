# Zero-cost production deployment checklist

Complete these steps on Vercel + Cloudflare after deploying the optimized code.

See **[NEON-FREE-PLAN.md](./NEON-FREE-PLAN.md)** for the full subscriber → D1 migration and staying under 100 Neon compute hours/month.

## 1. Cloudflare D1 databases

### Events (pixel + activity)

```bash
cd shopify-webpush-app/cloudflare-cron
npx wrangler d1 create push-eagle-events
```

Copy UUID → `CLOUDFLARE_D1_EVENTS_DATABASE_ID` (or `CLOUDFLARE_D1_DATABASE_ID`)

```bash
cd ..
npm run d1:init
```

### Audience (subscribers + tokens) — **largest Neon saver**

```bash
cd cloudflare-cron
npx wrangler d1 create push-eagle-audience
```

Copy UUID → `CLOUDFLARE_D1_AUDIENCE_DATABASE_ID`

### Deliveries (optional, after events)

```bash
npx wrangler d1 create push-eagle-deliveries
```

Copy UUID → `CLOUDFLARE_D1_DELIVERIES_DATABASE_ID`

## 2. Cloudflare Worker (cron + queue)

```bash
cd cloudflare-cron
npx wrangler queues create push-eagle-automation-jobs
npx wrangler queues create push-eagle-automation-jobs-dlq
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

Copy worker URL → Vercel `CLOUDFLARE_WORKER_URL`

## 3. Vercel env vars (push-eagle-dashboard)

| Variable | Value |
|----------|--------|
| `CRON_SECRET` | Same as worker |
| `CLOUDFLARE_ACCOUNT_ID` | `d889f0c23f53a9054e3ddf29872defd7` |
| `CLOUDFLARE_API_TOKEN` | Token with Workers KV Storage Edit + D1 Edit |
| `CLOUDFLARE_KV_NAMESPACE_ID` | `29ce646c32eb44d884376f1201749452` |
| `CLOUDFLARE_D1_DATABASE_ID` | Main D1 (commerce/customers/catalog) |
| `CLOUDFLARE_D1_AUDIENCE_DATABASE_ID` | Subscribers + tokens (see NEON-FREE-PLAN.md) |
| `CLOUDFLARE_D1_EVENTS_DATABASE_ID` | Events DB (optional dedicated) |
| `CLOUDFLARE_D1_DELIVERIES_DATABASE_ID` | Delivery detail (optional dedicated) |
| `CLOUDFLARE_WORKER_URL` | From step 2 |
| `AUTOMATION_QUEUE_ENABLED` | `true` |
| `D1_EVENTS_ENABLED` | `true` |
| `D1_AUDIENCE_MODE` | Start `dual_write` → backfill → `d1_only` |
| `D1_DELIVERIES_ENABLED` | `true` after deliveries backfill |
| `D1_COMMERCE_ENABLED` | `true` after commerce backfill |
| `D1_CUSTOMERS_ENABLED` | `true` |
| `D1_CATALOG_ENABLED` | `true` |

Redeploy Vercel after setting env vars.

## 4. Verify

- [ ] Neon dashboard: compute hours drop within 24–48h
- [ ] `cron_heartbeats` shows ticks; idle periods show `idle: true` in worker logs
- [ ] New subscriber + abandoned cart still fire
- [ ] Dashboard loads without `/settings/analytics`

## Rollback

Set `D1_EVENTS_ENABLED=false` and `AUTOMATION_QUEUE_ENABLED=false` on Vercel. Code falls back to Neon ingestion queue + cron-only automations.
