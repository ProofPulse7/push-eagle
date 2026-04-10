# Shopify-Ready Handoff

This folder is no longer just a scaffold. It contains the active dashboard, storefront push flow, webhook handlers, Neon persistence, and Firebase integration used by this repository.

## What is implemented

- Dashboard UI is live in `shopify-webpush-app`.
- Neon-backed persistence is wired into campaign, subscriber, attribution, and cleanup flows.
- Firebase client and admin integration are in place.
- Storefront bootstrap, token registration, conversion attribution, and dynamic service worker endpoints are implemented.
- Shopify webhook validation and merchant cleanup exist for the Next.js app.
- Safari/iOS PWA metadata and storefront guidance are included.

## What still needs production setup outside the codebase

1. Deploy the root Shopify embedded app.
2. Deploy `shopify-webpush-app`.
3. Point Shopify App URL and redirect URLs to the root embedded app deployment.
4. Point Shopify app proxy to the `shopify-webpush-app` deployment.
5. Configure the theme block with the `shopify-webpush-app` public URL.
6. Test installation, storefront opt-in, notification send, click tracking, and order attribution on a real store.

## Verification

- `shopify-webpush-app`: `npm run typecheck` passes.
- Root Prisma schema validates against PostgreSQL.
- Root workspace typecheck still has separate monorepo React type conflicts that are not specific to the push backend work.
