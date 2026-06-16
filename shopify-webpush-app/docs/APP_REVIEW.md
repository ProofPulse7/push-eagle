# Push Eagle — Shopify App Review Guide

Use this document for **Partner Dashboard → App submission → Testing instructions** and internal QA before submit.

## App type

- **Regular app** (not a Sales Channel or Payment Gateway)
- **Standalone** (`embedded = false`) — merchants open the web dashboard from Shopify Admin
- **Application URL:** `https://push-eagle-dashboard.vercel.app/dashboard`
- **OAuth backend:** `https://push-eagle.vercel.app` (handles install only; merchants use the dashboard UI)

## Test store credentials

Provide Shopify App Review with:

| Field | Value |
|-------|--------|
| **Development store URL** | _Add your dev store, e.g. `your-dev-store.myshopify.com`_ |
| **Store admin login** | _Add a staff account email/password for reviewers_ |
| **App install** | Install Push Eagle from the Partner dev store link or Shopify Admin → Apps |
| **Billing on dev stores** | Test charges apply automatically on development stores (`SHOPIFY_BILLING_TEST` or Shopify partner development flag) |

> Replace the placeholder rows above with real credentials before submitting. Never commit live passwords to git.

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
   **Plans** → activate **Basic** (free) or approve a **Business** test subscription. Confirm upgrade/downgrade works without contacting support.

6. **Automations**  
   Enable **Welcome notifications** or **Abandoned cart recovery** and confirm rules save.

7. **Legal pages**  
   Footer links open **Privacy** and **Terms**; **Back** returns to the previous in-app page.

## Scope justification (Partner submission form)

| Scope | Why Push Eagle needs it |
|-------|-------------------------|
| `read_orders` | Order webhooks and revenue attribution |
| `read_products` | Price-drop and product metadata in notifications |
| `read_inventory` | Back-in-stock automations |
| `read_fulfillments` | Shipping notification automations |
| `read_customers` | Segmentation and subscriber matching |
| `read_customer_events` | Storefront event context |
| `write_pixels` | Web pixel for checkout/cart events |
| `read_themes` | Detect whether the theme app embed is enabled |
| `write_app_proxy` | Storefront bootstrap, service worker, token registration |

Scopes **not** requested: `read_all_orders`, `write_payment_mandate`, checkout extension scopes, subscription contract scopes.

## Compliance notes

| Requirement | How Push Eagle meets it |
|-------------|-------------------------|
| OAuth immediately after install | Remix OAuth → SSO → dashboard; no UI before auth |
| Shopify Billing API | Paid plans via `appSubscriptionCreate`; free Basic activated locally |
| Plan changes in-app | Plans page upgrade/downgrade without reinstall |
| Shopify checkout | Does not bypass checkout; tracks events only |
| Theme app extensions | Storefront opt-in via theme embed (no manual theme code edits) |
| GDPR webhooks | `customers/data_request`, `customers/redact`, `shop/redact` on dashboard |
| Session tokens | Standalone app uses OAuth + SSO cookies (not embedded App Bridge) |
| Factual data | Revenue uses shop currency from Shopify; stats from database |

## Production checklist

- [ ] Partner Dashboard **Application URL** = `https://push-eagle-dashboard.vercel.app/dashboard`
- [ ] Partner Dashboard **Privacy URL** = `https://push-eagle-dashboard.vercel.app/privacy`
- [ ] Partner Dashboard **Terms URL** = `https://push-eagle-dashboard.vercel.app/terms`
- [ ] Production Vercel: `SHOPIFY_BILLING_TEST` is **not** `true`
- [ ] Run `shopify app deploy` after `shopify.app.toml` changes
- [ ] Paste test credentials and this walkthrough into the submission form

## Support

- Email: support@push-eagle.com
