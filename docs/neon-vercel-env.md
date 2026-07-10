# Neon database — Vercel environment variables

Both Vercel projects must use the **same** Neon Postgres database (production branch, pooler endpoint). Neon runs **PostgreSQL 18**.

| Neon detail | Value |
|-------------|--------|
| Host (pooler) | `ep-crimson-glitter-aodrbrnd-pooler.c-2.ap-southeast-1.aws.neon.tech` |
| Database | `neondb` |
| Role | `neondb_owner` |
| Branch | Production |

**Retired hosts (do not use):** `ep-weathered-wind-…`, `ep-winter-fire-…`

## Vercel — `push-eagle` (Remix)

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | `postgresql://neondb_owner:YOUR_PASSWORD@ep-crimson-glitter-aodrbrnd-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `NEON_DATABASE_URL` | Same connection string (keep in sync with `DATABASE_URL`) |

Deploy once after saving — build runs `prisma db push` and creates `shopify_sessions."Session"` (or `public."Session"` depending on schema config).

## Vercel — `push-eagle-dashboard` (Next.js)

| Variable | Value |
|----------|--------|
| `NEON_DATABASE_URL` | Same connection string as above |
| `SHOPIFY_SESSION_DATABASE_URL` | Same host + `&schema=shopify_sessions` |
| `DATABASE_URL` | Same connection string (optional backup) |

Business tables are created automatically on first use via `ensureSchema()`. To pre-init:

```bash
cd shopify-webpush-app
NEON_DATABASE_URL="..." npm run db:init-schema
```

## Local development

- Copy `.env.example` → `.env` (repo root, Remix)
- Copy `shopify-webpush-app/.env.example` → `shopify-webpush-app/.env.local` (dashboard)

**Never commit files containing real passwords.**

## Fresh database vs data migration

Updating env vars alone starts with an **empty** database. Merchants must open the app from Shopify Admin again to OAuth. To move existing data, use a Node/`pg` migrator (or `pg_dump`/`pg_restore` matching the server major version) from the old Neon project before cutover.
