# Shopify scopes and events plan for Push Eagle

## Goals
- Capture subscriber intent events with minimal data loss.
- Trigger automations from Shopify events and storefront behavior.
- Keep scope requests as narrow as possible while supporting analytics and recovery flows.

## Confirmed scope requirements

### Core scopes already used
- read_orders: orders, checkout, cart webhook topics, attribution joins.
- read_products: product updates, product metadata for price-drop and browse reminders.
- read_inventory: inventory_levels/update for back-in-stock.
- read_fulfillments: fulfillments/update shipping automation.
- read_customers: customer identity and segmentation.
- read_customer_events: required for web pixel customer events.
- write_pixels: required to create and configure app web pixel records.

### Recommended optional scopes (request only when feature is shipped)
- read_all_orders: needed for full historical analytics beyond default 60-day orders window.
- read_reports: optional for ShopifyQL-derived analytics.
- read_discounts: optional for discount-aware messaging and post-purchase offers.

## Webhook topics in use
- orders/create
- carts/update
- checkouts/create
- checkouts/update
- products/update
- inventory_levels/update
- fulfillments/update
- app/uninstalled
- app/scopes_update

## Automation signal mapping
- browse_abandonment_15m: storefront product_view + suppression on checkout/order progression.
- cart_abandonment_30m: storefront add_to_cart and carts/update webhook.
- checkout_abandonment_30m: storefront checkout_start and checkouts/create/update webhooks.
- back_in_stock: inventory_levels/update and cached inventory transition detection.
- price_drop: products/update and cached variant price delta detection.
- shipping_notifications: fulfillments/update and order-to-subscriber join.
- post_purchase_followup: orders/create delayed queue.
- win_back_7d: orders/create delayed queue with newer-order suppression.

## Web pixel rollout notes
- Build a web pixel extension for resilient browser behavior tracking.
- Request required scopes: write_pixels and read_customer_events.
- Subscribe to standard customer events and forward to dashboard ingestion endpoint.
- Respect customer privacy settings and consent gating.

## Scale and reliability guidance
- Keep webhook handlers fast: verify, dedupe, enqueue, return 200 quickly.
- Store compact payload slices (include_fields) and avoid full object persistence.
- Keep reconciliation jobs for critical data (orders, products, inventory) in case of missed webhooks.
- Use all active subscriber tokens for sends and dedupe per token.
- Continue shard-based cron processing for campaign and automation throughput.

## Token quality and delivery quality checks
- Keep silent token resync when browser permission is already granted.
- Mark invalid tokens inactive from FCM response codes.
- Record token last_seen_at on registration and successful sends.
- Enforce idempotent send records per campaign and token.

## Tracking and attribution
- Track impression and click events with campaign and token context.
- Attribute conversion with both click and impression windows.
- Join order events by external identity and customer identity when available.
- Keep per-customer history: subscription events, campaign sends, clicks, purchases, and recency.

## Data retention policy (free-plan friendly)
- webhook_events: 30 days.
- subscriber_activity_events: 45 days.
- completed/failed/skipped automation_jobs: 60 days.
- keep compact latest-state caches for product variants and fulfillments.
