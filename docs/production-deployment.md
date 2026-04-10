# Production Deployment

This repository currently contains two deployable apps:

- Root Shopify embedded admin app in the repository root.
- Next.js dashboard + storefront API app in `shopify-webpush-app`.

## Recommended production URLs

Use separate public URLs unless you add your own reverse proxy in front of both apps.

- Shopify embedded admin app: `https://push-eagle.vercel.app`
- Dashboard/storefront backend app: `https://push-eagle-dashboard.vercel.app`

If you only use a single Vercel URL for both, the current repo layout will conflict.

## Root Shopify app env vars

Set these in the Vercel project that deploys the repository root:

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SCOPES`
- `SHOPIFY_APP_URL`: public URL of the root embedded app
- `SHOPIFY_WEB_DASHBOARD_URL`: public URL of the Next.js app iframe target
- `DATABASE_URL`: Postgres connection string for Prisma session storage

## Next.js app env vars

Set these in the Vercel project that deploys `shopify-webpush-app`:

- `NEXT_PUBLIC_APP_URL`: public URL of the Next.js app
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_SCOPES`
- `SHOPIFY_APP_URL`: public URL of the Next.js app
- `SHOPIFY_WEBHOOK_SECRET`: normally same as Shopify app secret
- `DATABASE_PROVIDER=neon`
- `NEON_DATABASE_URL`
- Firebase client env vars
- `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64`

## Shopify Partner Dashboard values

Update these to the root embedded app URL:

- App URL / Application URL
- Allowed redirection URL(s)

Update app proxy to point to the Next.js app URL:

- Proxy prefix: `apps`
- Proxy subpath: `push-eagle`
- Proxy URL: `https://push-eagle-dashboard.vercel.app/api/storefront`

## Theme block values

In the `Push Eagle Prompt` theme block:

- Shop domain: merchant store domain, for example `your-store.myshopify.com`
- Push Eagle app URL: public URL of the Next.js app
- App proxy bootstrap path: `/apps/push-eagle/bootstrap`
- App proxy service worker path: `/apps/push-eagle/sw.js`

## External values still needed later

These are the only external values likely still needed from you to finish production cutover:

- Final root embedded app URL
- Final Next.js app URL
- Merchant test store domain
- Confirmation that Shopify app proxy is enabled with the values above

## How to find them

- Vercel project URL: open the project in Vercel and copy the production domain from the project overview.
- Shopify app proxy: Shopify Partner Dashboard -> your app -> App setup -> App proxy.
- Shopify redirect URLs and app URL: Shopify Partner Dashboard -> your app -> Distribution or App setup, depending on the current UI.
- Test store domain: Shopify Admin URL host, usually `store-name.myshopify.com`.