# Push Eagle — Shopify App Review Guide

Use this document for **Partner Dashboard → App submission → Testing instructions** and internal QA before submit.

## App type

- **Regular app** (not a Sales Channel or Payment Gateway)
- **Standalone** (`embedded = false`) — merchants open the web dashboard from Shopify Admin
- **Application URL:** `https://push-eagle-dashboard.vercel.app/api/auth/connect`
- **OAuth backend:** `https://push-eagle.vercel.app` (handles install only; merchants use the dashboard UI)
- **Privacy URL:** `https://push-eagle-dashboard.vercel.app/privacy`
- **Terms URL:** `https://push-eagle-dashboard.vercel.app/terms`

## Test store credentials (required for submission)

Paste these into **Partner Dashboard → App → Distribution → Shopify App Store → Testing instructions**. Do **not** commit real passwords to git.

| Field | Value |
|-------|--------|
| **Development store URL** | `____________________.myshopify.com` |
| **Store admin login email** | `____________________` |
| **Store admin login password** | `____________________` (Partner form only) |
| **App install** | Install Push Eagle from the Partner dev store link or Shopify Admin → Apps |
| **Billing on dev stores** | Test charges apply automatically on development stores |

## Review walkthrough (5–10 minutes)

1. **Install & authenticate**  
   Open the app from Shopify Admin → Apps → Push Eagle. OAuth completes and lands on the dashboard.

2. **Enable storefront opt-in**  
   On the dashboard, if the yellow banner appears, click **Enable Push Eagle** → theme editor App embeds → toggle **Push Eagle Notifications** → **Save**.

3. **Collect a subscriber**  
   Visit the storefront in Chrome, accept the browser notification prompt, confirm the subscriber appears under **Subscribers**.

4. **Send a campaign**  
   **Campaigns → Create Campaign** → compose → **Launch Campaign**. Confirm delivery count increases.

5. **Billing**  
   **Plans** → activate **Basic** (free) instantly, then optionally approve a **Business** test subscription. Confirm upgrade and downgrade to Basic work without contacting support.

6. **Automations**  
   Enable **Welcome notifications** or **Abandoned cart recovery** and confirm rules save.

7. **Legal pages**  
   Footer links open **Privacy** and **Terms**; **Back** returns to the previous in-app page.

## Scope justification (Partner submission form)

| Scope | Why Push Eagle needs it |
|-------|-------------------------|
| `read_orders` | Order webhooks and revenue attribution (standard 60-day window) |
| `read_products` | Price-drop and product metadata in notifications |
| `read_inventory` | Back-in-stock automations |
| `read_fulfillments` | Shipping notification automations |
| `read_customers` | Segmentation, subscriber matching, GDPR exports |
| `read_customer_events` | Required for Shopify web pixel runtime and storefront event context |
| `write_pixels` | Registers the Push Eagle web pixel for browse/cart/checkout events |
| `read_themes` | Detect whether the theme app embed is enabled |
| `write_app_proxy` | Storefront bootstrap, service worker, token registration |

Scopes **not** requested: `read_all_orders`, `write_payment_mandate`, checkout extension scopes, subscription contract scopes.

## Compliance notes

| Requirement | How Push Eagle meets it |
|-------------|-------------------------|
| OAuth immediately after install | Remix OAuth → SSO → dashboard; no merchant UI before auth |
| Shopify Billing API | Paid plans via `appSubscriptionCreate`; free Basic activated locally |
| Plan changes in-app | Plans page upgrade/downgrade without reinstall |
| Shopify checkout | Does not bypass checkout; tracks events only |
| Theme app extensions | Storefront opt-in via theme embed (no manual theme code edits) |
| Web pixel | Active pixel sends page/product/checkout events via app proxy |
| GDPR webhooks | `customers/data_request`, `customers/redact`, `shop/redact` on dashboard |
| GDPR customer data requests | Export emailed to shop contact email via Resend |
| GDPR shop redact | Deletes merchant data, billing, credentials, and sessions |
| Session handling | Standalone app uses OAuth + SSO cookies (not embedded App Bridge session tokens) |
| Storefront security | App proxy signature or verified storefront origin required for write endpoints |
| Factual data | Revenue uses shop currency from Shopify; stats from database |

## Production checklist (complete before submit)

### Partner Dashboard
- [ ] **Application URL** = `https://push-eagle-dashboard.vercel.app/api/auth/connect`
- [ ] **Privacy URL** = `https://push-eagle-dashboard.vercel.app/privacy`
- [ ] **Terms URL** = `https://push-eagle-dashboard.vercel.app/terms`
- [ ] Run `shopify app deploy` from monorepo root after any `shopify.app.toml` change
- [ ] Paste test credentials and this walkthrough into the submission form

### Vercel — dashboard (`push-eagle-dashboard`)
- [ ] `NEXT_PUBLIC_APP_URL=https://push-eagle-dashboard.vercel.app`
- [ ] `SHOPIFY_APP_URL=https://push-eagle-dashboard.vercel.app`
- [ ] `SHOPIFY_ROOT_APP_URL=https://push-eagle.vercel.app`
- [ ] `SHOPIFY_SCOPES` matches `shopify.app.toml`
- [ ] `SHOPIFY_BILLING_TEST` is **unset** or `false` in production
- [ ] `RESEND_API_KEY` set for GDPR export email delivery
- [ ] `GDPR_EXPORT_FROM_EMAIL=support@push-eagle.com` (or verified sender domain)

### Vercel — Remix OAuth (`push-eagle`)
- [ ] `SHOPIFY_APP_URL=https://push-eagle.vercel.app`
- [ ] `SHOPIFY_WEB_DASHBOARD_URL=https://push-eagle-dashboard.vercel.app`
- [ ] `SCOPES` matches `shopify.app.toml`

### Final QA on dev store
- [ ] Fresh install → dashboard loads
- [ ] Theme embed → subscriber → campaign send
- [ ] Plans: Basic activate, Business subscribe, downgrade to Basic
- [ ] Uninstall → reinstall works

## Submission note for reviewers (standalone app)

Push Eagle is a **standalone** app (`embedded = false`). Session tokens / App Bridge are not used. Authentication uses Shopify OAuth (Remix backend) and secure SSO cookies on the dashboard. This is the supported pattern for non-embedded apps.

## Support

- Email: support@push-eagle.com
