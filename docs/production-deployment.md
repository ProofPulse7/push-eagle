# Production Deployment

Push Eagle uses **two public URLs** that work together:

| Role | Vercel project | URL | What it does |
|------|----------------|-----|--------------|
| **Web app** (Next.js) | `push-eagle-dashboard` | `https://push-eagle-dashboard.vercel.app` | Merchant dashboard UI, plans, automations, business webhooks, app proxy APIs. **Edit `shopify-webpush-app/` → push here.** |
| **Shopify app** (Remix) | `push-eagle` | `https://push-eagle.vercel.app` | Shopify OAuth, session storage, GDPR compliance webhooks, connection between Shopify and the web app. **Edit `app/` + `shopify.app.toml` → push here.** |

Merchants open the app from Shopify Admin at:

**Application URL:** `https://push-eagle-dashboard.vercel.app/dashboard` (`embedded = false`)

The Remix app at `push-eagle.vercel.app` is the **backend** — merchants do not bookmark it.

## How the two apps connect

```
Shopify Admin → push-eagle-dashboard.vercel.app/dashboard  (web app UI)
                      ↓ (no valid token)
              push-eagle.vercel.app/app                      (Shopify OAuth)
                      ↓ (OAuth + session saved to Neon)
              push-eagle-dashboard.vercel.app/dashboard      (SSO back to web app)
```

1. Merchant clicks **Apps → Push Eagle** in Shopify Admin.
2. Shopify loads `https://push-eagle-dashboard.vercel.app/dashboard`.
3. If OAuth is needed, the dashboard sends them to `https://push-eagle.vercel.app/app?shop=...`.
4. Remix completes OAuth, saves the offline token to Neon, syncs merchant data, then SSO-redirects to the dashboard.
5. Dashboard reads the token from Neon and shows plans, campaigns, etc.

Both apps share the **same Neon database** (`public.Session`, `shopify_store_credentials`, merchants).

## Local development (`shopify app dev`)

Running `shopify app dev` on your PC:

- Shopify CLI opens a **tunnel** to your machine for your dev store only.
- Production URLs on Vercel (`push-eagle.vercel.app`, `push-eagle-dashboard.vercel.app`) are **not** changed.
- `automatically_update_urls_on_dev = false` in `shopify.app.toml` keeps production URLs stable.

To update production Partner Dashboard config (application URL, redirects, webhooks): run `shopify app deploy` from the repo root.

## Shopify Partner Dashboard (`shopify.app.toml`)

| Setting | Value |
|---------|-------|
| Application URL | `https://push-eagle-dashboard.vercel.app/dashboard` |
| Embedded | `false` |
| OAuth redirect URLs | `https://push-eagle.vercel.app/auth/*` only |
| Business webhooks | `https://push-eagle-dashboard.vercel.app/api/shopify/webhooks/*` |
| GDPR compliance webhooks | `https://push-eagle.vercel.app/webhooks/*` |
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
| `SHOPIFY_BILLING_TEST` | `true` on dev stores (optional) |

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
