# Neon database — Vercel environment variables

Both Vercel projects must use the **same** Neon Postgres database (production branch, pooler endpoint).

| Neon detail | Value |
|-------------|--------|
| Host (pooler) | `ep-weathered-wind-aogxzw4p-pooler.c-2.ap-southeast-1.aws.neon.tech` |
| Database | `neondb` |
| Role | `neondb_owner` |
| Branch | production (default) |

## Vercel — `push-eagle` (Remix)

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | `postgresql://neondb_owner:YOUR_PASSWORD@ep-weathered-wind-aogxzw4p-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |

Deploy once after saving — build runs `prisma db push` and creates `public."Session"`.

## Vercel — `push-eagle-dashboard` (Next.js)

| Variable | Value |
|----------|--------|
| `NEON_DATABASE_URL` | Same connection string as `DATABASE_URL` above |
| `SHOPIFY_SESSION_DATABASE_URL` | Same connection string (optional; auto-derived if omitted) |
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

Updating env vars alone starts with an **empty** database. Merchants must open the app from Shopify Admin again to OAuth. To move existing data, use `pg_dump` / `pg_restore` from the old Neon project before cutover.
