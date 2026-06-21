# Production Deployment

Push Eagle uses **two public URLs** that work together:

| Role | Vercel project | URL | What it does |
|------|----------------|-----|--------------|
| **Web app** (Next.js) | `push-eagle-dashboard` | `https://push-eagle-dashboard.vercel.app` | Merchant dashboard UI, plans, automations, business webhooks, app proxy APIs. **Edit `shopify-webpush-app/` → push here.** |
| **Shopify app** (Remix) | `push-eagle` | `https://push-eagle.vercel.app` | Shopify OAuth, session storage, and SSO bridge to the dashboard. **Edit `app/` + `shopify.app.toml` → push here.** |

Merchants open the app from Shopify Admin at:

**Application URL:** `https://push-eagle-dashboard.vercel.app/api/auth/connect` (`embedded = false`)

**App Review testing guide:** see [`shopify-webpush-app/docs/APP_REVIEW.md`](./shopify-webpush-app/docs/APP_REVIEW.md) for reviewer credentials template and walkthrough.

The Remix app at `push-eagle.vercel.app` is the **backend** — merchants do not bookmark it.

## How the two apps connect

```
Shopify Admin → push-eagle-dashboard.vercel.app/api/auth/connect  (fast auth entry)
                      ↓ (sets cookies or OAuth)
              push-eagle-dashboard.vercel.app/dashboard      (merchant UI)
                      ↓ (no valid token)
              push-eagle.vercel.app/app                      (Shopify OAuth)
                      ↓ (OAuth + session saved to Neon)
              push-eagle-dashboard.vercel.app/dashboard      (SSO back to web app)
```

1. Merchant clicks **Apps → Push Eagle** in Shopify Admin.
2. Shopify loads `https://push-eagle-dashboard.vercel.app/api/auth/connect`.
3. Connect sets auth cookies or sends the merchant to `https://push-eagle.vercel.app/app?shop=...` for OAuth.
4. Remix completes OAuth, saves the offline token to Neon, syncs merchant data, then SSO-redirects to the dashboard.
5. Dashboard reads the token from Neon and shows plans, campaigns, etc.

Both apps share the **same Neon database** (`public.Session`, `shopify_store_credentials`, merchants).

## Neon database migration (new Neon project)

**Code change is not required.** Both apps read Postgres only from environment variables. Point them at the new Neon project and initialize schema once.

### Environment variables to update (Vercel)

| Project | Variable | Value |
|---------|----------|--------|
| `push-eagle` (Remix) | `DATABASE_URL` | New Neon pooled connection string (`postgresql://…/neondb?sslmode=require`) |
| `push-eagle-dashboard` (Next.js) | `NEON_DATABASE_URL` | **Same URL** as Remix `DATABASE_URL` |
| `push-eagle-dashboard` (Next.js) | `SHOPIFY_SESSION_DATABASE_URL` | Same URL (optional; auto-derived from `NEON_DATABASE_URL` if omitted) |
| `push-eagle-dashboard` (Next.js) | `DATABASE_URL` | Optional duplicate of `NEON_DATABASE_URL` |

Use the **pooler** host (`…-pooler…neon.tech`). Prefer `sslmode=require` only. If a client fails with `channel_binding=require`, remove that query param.

**Do not** wrap URLs in quotes in Vercel.

### One-time schema setup on a fresh database

The dashboard creates all business tables automatically on first API use via `ensureSchema()` in `store.ts`. For a controlled init before deploy:

```bash
cd shopify-webpush-app
NEON_DATABASE_URL="postgresql://USER:PASS@HOST/neondb?sslmode=require" npm run db:init-schema
```

The Remix app creates the OAuth `Session` table on deploy/build via Prisma:

```bash
# From repo root (push-eagle)
DATABASE_URL="postgresql://USER:PASS@HOST/neondb?sslmode=require" npx prisma db push
```

Or deploy Remix to Vercel once after setting `DATABASE_URL` — the build runs `prisma db push`.

`shopify_store_credentials` is created automatically on first OAuth/billing sync (lazy DDL).

### Data migration (important)

Updating env vars alone gives you an **empty** database. Existing merchants, subscribers, campaigns, and analytics **stay on the old Neon project** unless you migrate data.

To move production data: use Neon branch copy, `pg_dump` / `pg_restore`, or Neon’s logical replication between projects. After cutover, revoke or delete the old project so nothing still points at it.

### Local development

Set the same URL in:

- Repo root `.env` → `DATABASE_URL` (Remix / Prisma)
- `shopify-webpush-app/.env.local` → `NEON_DATABASE_URL`

Never commit real connection strings to git.

## Local development (`shopify app dev`)

Running `shopify app dev` on your PC:

- Shopify CLI opens a **tunnel** to your machine for your dev store only.
- Production URLs on Vercel (`push-eagle.vercel.app`, `push-eagle-dashboard.vercel.app`) are **not** changed.
- `automatically_update_urls_on_dev = false` in `shopify.app.toml` keeps production URLs stable.

To update production Partner Dashboard config (application URL, redirects, webhooks): run `shopify app deploy` from the repo root.

## What goes where (two folders)

| Change | Folder | How it goes live |
|--------|--------|------------------|
| Shopify Partner settings (app URL, webhooks, OAuth redirects, scopes) | `push-eagle/` → `shopify.app.toml` | `shopify app deploy` from repo root |
| Shopify backend code (OAuth, sessions, merchant-site connection) | `push-eagle/` → `app/` | Git push → `push-eagle` repo → Vercel `push-eagle.vercel.app` |
| Web dashboard UI + Plans billing API | `shopify-webpush-app/` | Git push → `push-eagle-dashboard` repo → Vercel `push-eagle-dashboard.vercel.app` |
| Runtime secrets (`SHOPIFY_BILLING_TEST`, Neon URL, API keys) | **Not** in `shopify.app.toml` | Vercel → Environment Variables → redeploy |

`SHOPIFY_BILLING_TEST=true` enables **test** app subscription charges on dev stores. Set it on the **dashboard** Vercel project (`shopify-webpush-app`), because Plans checkout runs there. After saving the variable in Vercel, trigger a redeploy (or push to GitHub). `shopify app deploy` does **not** apply this setting.

## Shopify Partner Dashboard (`shopify.app.toml`)

| Setting | Value |
|---------|-------|
| Application URL | `https://push-eagle-dashboard.vercel.app/api/auth/connect` |
| Embedded | `false` |
| OAuth redirect URLs | `https://push-eagle.vercel.app/auth/*` only |
| Business webhooks | `https://push-eagle-dashboard.vercel.app/api/shopify/webhooks/*` |
| GDPR compliance webhooks | `https://push-eagle-dashboard.vercel.app/api/shopify/webhooks/*` |
| App proxy | `https://push-eagle-dashboard.vercel.app/api/storefront` |

## Vercel env — Shopify app (`push-eagle.vercel.app`)

| Variable | Value |
|----------|-------|
| `SHOPIFY_API_KEY` | Partner app client ID |
| `SHOPIFY_API_SECRET` | Partner app secret |
| `SCOPES` | Same as `shopify.app.toml` scopes |
| `SHOPIFY_APP_URL` | `https://push-eagle.vercel.app` |
| `SHOPIFY_WEB_DASHBOARD_URL` | `https://push-eagle-dashboard.vercel.app` |
| `DATABASE_URL` | Neon Postgres URL (same as dashboard `NEON_DATABASE_URL`) |
| `SHOPIFY_DASHBOARD_SSO_SECRET` | Same as `SHOPIFY_API_SECRET` (or a shared secret) |

## Vercel env — Web app (`push-eagle-dashboard.vercel.app`)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_APP_URL` | `https://push-eagle-dashboard.vercel.app` |
| `SHOPIFY_APP_URL` | `https://push-eagle-dashboard.vercel.app` |
| `SHOPIFY_ROOT_APP_URL` | `https://push-eagle.vercel.app` (Remix Shopify backend) |
| `SHOPIFY_API_KEY` | Same client ID |
| `SHOPIFY_API_SECRET` | Same secret |
| `NEON_DATABASE_URL` | Same Neon URL as Remix `DATABASE_URL` |
| `SHOPIFY_SESSION_DATABASE_URL` | Same Neon URL (reads `public.Session`) |
| `SHOPIFY_DASHBOARD_SSO_SECRET` | Same value as on Remix project |
| `SHOPIFY_SCOPES` | Same as `shopify.app.toml` scopes |
| `RESEND_API_KEY` | Transactional email for GDPR data request delivery |
| `GDPR_EXPORT_FROM_EMAIL` | `support@push-eagle.com` (verified sender in Resend) |
| `SHOPIFY_BILLING_TEST` | `true` on dev/preview only — **must be unset/false in production** |

**Important:** `NEXT_PUBLIC_APP_URL` and `SHOPIFY_APP_URL` must be the **dashboard** URL. `SHOPIFY_ROOT_APP_URL` must be the **Remix** URL.

## Deploy checklist

| Change | Action |
|--------|--------|
| Next.js / dashboard code | Push `shopify-webpush-app/` → `push-eagle-dashboard` repo → Vercel redeploys dashboard |
| Remix / Shopify backend | Push `app/`, `shopify.app.toml` → `push-eagle` repo → Vercel redeploys Remix |
| Partner Dashboard config | Run `shopify app deploy` from repo root (does not deploy Vercel code) |
| Local dev store only | Run `shopify app dev` on your PC |

## Theme block

In the **Push Eagle Prompt** theme block:

- Shop domain: `your-store.myshopify.com`
- Push Eagle app URL: `https://push-eagle-dashboard.vercel.app`
- App proxy bootstrap: `/apps/push-eagle/bootstrap`
- App proxy service worker: `/apps/push-eagle/sw.js`
