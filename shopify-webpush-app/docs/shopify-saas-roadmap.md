# Shopify SaaS Hardening Roadmap

This project now supports:

- Embedded Shopify app launching dashboard with signed SSO handoff.
- Auto merchant account provisioning from Shopify context.
- Reinstall-safe merchant lifecycle (`app/uninstalled` marks account uninstalled, keeps data).

## 1. Auth and account lifecycle

- Keep root app as Shopify auth authority.
- Keep dashboard access through signed SSO endpoint only (`/api/integrations/shopify/sso`) for embedded launches.
- Use short-lived signed payloads (already 5 minute window).
- Add nonce replay protection (Redis or DB table) for one-time SSO payload validation.
- Keep uninstall behavior soft-delete style so reinstall restores prior subscriber/campaign history.

## 2. Webhooks reliability

- Verify `X-Shopify-Hmac-Sha256` on every webhook endpoint.
- Store webhook idempotency key from `X-Shopify-Event-Id` and skip duplicate events.
- Record webhook ingestion logs with status, attempt count, and payload hash.
- Add dead-letter handling for failed webhook processing.

## 3. Theme app extension and embed

- Keep prompt UX as theme app extension block/app embed (no direct theme file edits).
- Expose merchant-friendly settings in extension schema (prompt mode, timing, branding).
- Add extension-side kill switch from dashboard settings to disable storefront prompt globally.

## 4. Pixel and event tracking

- Implement Shopify web pixel app extension for standardized customer events.
- Respect customer privacy consent signals before any tracking logic.
- Use event schema versioning for backward-compatible analytics ingestion.
- Maintain strict CORS and signed ingestion endpoints.

## 5. Segmentation and analytics data model

- Move from static UI metrics to DB-backed merchant dashboards.
- Add event tables for page views, product views, add-to-cart, checkout started, order completed.
- Build segment materialization jobs (active subscribers, high intent, repeat buyers, dormant).
- Add per-shop retention policy and aggregation tables for cost-efficient analytics queries.

## 6. Security and compliance

- Rotate Firebase admin and Shopify shared secrets regularly.
- Add at-rest encryption policy for sensitive fields.
- Add per-shop RBAC for future multi-user merchant teams.
- Add data export/delete workflows for compliance operations.

## 7. App Store readiness

- Add onboarding checklist screen after install.
- Add merchant-facing health checks (proxy, webhook, firebase, sw registration).
- Add usage-based plans and billing integration.
- Add support diagnostics bundle for merchant troubleshooting.