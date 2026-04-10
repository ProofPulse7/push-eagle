# Shopify-Ready Handoff

This folder is a cloned and stabilized app scaffold intended to be moved into your Shopify app project.

## What is done

- Full UI copied into `shopify-webpush-app` and compiled.
- Major TypeScript issues fixed in automation editors, campaign composer, and data tables.
- Integration layer added:
  - `src/lib/config/env.ts`
  - `src/lib/integrations/shopify/server.ts`
  - `src/lib/integrations/database/index.ts`
  - `src/lib/integrations/database/neon.ts`
  - `src/lib/integrations/database/supabase.ts`
  - `src/lib/integrations/firebase/client.ts`
  - `src/lib/services/web-push/push-service.ts`
- Starter API routes added:
  - `src/app/api/integrations/health/route.ts`
  - `src/app/api/shopify/webhooks/app-uninstalled/route.ts`
- Environment template added: `.env.example`

## What to do in your Shopify app next

1. Copy this folder into your Shopify app repository.
2. Merge/align your auth/session model with `src/lib/integrations/shopify/server.ts`.
3. Create database schema (merchants, subscribers, push_tokens, campaigns, automation_runs, deliveries, events).
4. Replace webhook placeholder with real HMAC validation and uninstall cleanup.
5. Add secure token storage + per-shop segmentation.
6. Connect dashboard cards/charts to real event tables.

## Browser compatibility baseline

- Use Firebase Messaging in supported browsers.
- Keep graceful fallback when notifications are blocked/unsupported.
- Service worker scripts already exist in `public/` and can be adapted for production.

## Quick check

- `npm install`
- `npm run typecheck`
- `npm run build`
- `GET /api/integrations/health`
