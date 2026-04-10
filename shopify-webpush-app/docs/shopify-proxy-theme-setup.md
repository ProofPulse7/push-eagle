# Shopify Proxy + Theme Setup

This project uses Shopify app proxy + theme app extension for storefront token collection.

## Required Shopify app proxy settings

In your Shopify Partner app configuration, set:

- App proxy subpath prefix: `apps`
- App proxy subpath: `push-eagle`
- Proxy URL: `https://YOUR_NEXT_APP_DOMAIN/api/storefront`

With this mapping:

- `https://STORE_DOMAIN/apps/push-eagle/bootstrap` -> `/api/storefront/bootstrap`
- `https://STORE_DOMAIN/apps/push-eagle/sw.js` -> `/api/storefront/sw.js`

## Theme app extension block

Enable `Push Eagle Prompt` block in your theme editor.

Set values:

- Shop domain: `your-store.myshopify.com`
- Push Eagle app URL: `https://YOUR_NEXT_APP_DOMAIN`
- App proxy bootstrap path: `/apps/push-eagle/bootstrap`
- App proxy service worker path: `/apps/push-eagle/sw.js`

## Why this setup

- `bootstrap` is Shopify-signed, so we trust storefront identity and shop context.
- `sw.js` is served via same merchant origin and can request root scope via `Service-Worker-Allowed: /`.
- Token save goes to your backend `/api/storefront/token` with CORS support.
