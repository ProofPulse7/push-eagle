# Production Deployment

Push Eagle uses **one public URL** for merchants:

| App | Vercel project | Public URL |
|-----|----------------|------------|
| **Web dashboard** (Next.js UI + APIs + OAuth) | `push-eagle-dashboard` | `https://push-eagle-dashboard.vercel.app` |

The `push-eagle/` folder at the repo root is the **Shopify app source** for Partner Dashboard config and local `shopify app dev` on your PC. Merchants never visit a separate Remix URL in production.

## Shopify Partner Dashboard

Set via `shopify.app.toml` + `shopify app deploy`:

- **Application URL**: `https://push-eagle-dashboard.vercel.app/dashboard`
- **Embedded**: `false` (standalone web app)
- **OAuth redirect URLs** (dashboard only):
  - `https://push-eagle-dashboard.vercel.app/auth/callback`
  - `https://push-eagle-dashboard.vercel.app/api/auth/callback`
- **Webhooks**: all URIs on `push-eagle-dashboard.vercel.app/api/shopify/webhooks/*`
- **App proxy**: `https://push-eagle-dashboard.vercel.app/api/storefront`

## Local development vs production

- **`shopify app dev`** (on your PC): Shopify CLI tunnels to your machine for the dev store only. Production URLs on Vercel are unchanged.
- **`shopify app deploy`**: updates Partner Dashboard config (application URL, redirects, webhooks). Does not deploy your Next.js code — push to GitHub for Vercel redeploy.
- **`automatically_update_urls_on_dev = false`** in `shopify.app.toml` so local tunnels do not overwrite production URLs.

## Merchant flow

1. Merchant opens **Apps → Push Eagle** in Shopify Admin.
2. Shopify loads `https://push-eagle-dashboard.vercel.app/dashboard`.
3. If OAuth is needed, dashboard sends them to Shopify install (`oauth/install`).
4. Shopify redirects to `https://push-eagle-dashboard.vercel.app/auth/callback` on the dashboard.
5. Dashboard saves the offline token to Neon and shows the dashboard.

## Vercel env vars (dashboard project)

Set these on the `push-eagle-dashboard` Vercel project:

- `NEXT_PUBLIC_APP_URL`: `https://push-eagle-dashboard.vercel.app`
- `SHOPIFY_APP_URL`: `https://push-eagle-dashboard.vercel.app` (same as above)
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_SCOPES`
- `SHOPIFY_WEBHOOK_SECRET`: normally same as Shopify app secret
- `DATABASE_PROVIDER=neon`
- `NEON_DATABASE_URL`
- `SHOPIFY_SESSION_DATABASE_URL`: same Neon URL as `NEON_DATABASE_URL` (reads `public.Session` for offline tokens)
- `SHOPIFY_DASHBOARD_SSO_SECRET`: same as `SHOPIFY_API_SECRET` (signed internal API calls)
- `SHOPIFY_BILLING_TEST=true` on dev stores (optional)
- Firebase client env vars
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64`

`SHOPIFY_ROOT_APP_URL` is optional legacy — if set, it should also be `https://push-eagle-dashboard.vercel.app`.

## Theme block values

In the **Push Eagle Prompt** theme block:

- Shop domain: merchant store domain, e.g. `your-store.myshopify.com`
- Push Eagle app URL: `https://push-eagle-dashboard.vercel.app`
- App proxy bootstrap path: `/apps/push-eagle/bootstrap`
- App proxy service worker path: `/apps/push-eagle/sw.js`

## Deploy checklist

1. Push `shopify-webpush-app/` changes to GitHub → Vercel redeploys dashboard.
2. Run `shopify app deploy` from repo root to sync Partner Dashboard config.
3. Confirm Vercel env vars use `push-eagle-dashboard.vercel.app` (not `push-eagle.vercel.app`).
4. Open Apps → Push Eagle on a dev store and verify dashboard loads + plans work.
