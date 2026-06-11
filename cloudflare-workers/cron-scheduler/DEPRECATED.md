# Deprecated — do not deploy

This worker duplicates `shopify-webpush-app/cloudflare-cron/`.

Both were configured with the same Cloudflare worker name (`push-eagle-cron-pinger`), which can cause conflicting deployments.

**Use instead:** `shopify-webpush-app/cloudflare-cron/` (includes abandoned-cart cron and full shard config).

This copy is kept for reference only and should not be deployed to production.
