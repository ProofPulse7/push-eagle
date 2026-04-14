# Push Eagle web pixel activation

This extension captures Shopify standard customer events in strict sandbox and forwards normalized events to Push Eagle ingestion.

## Added extension
- Extension folder: extensions/push-eagle-web-pixel
- Runtime: strict sandbox
- Default ingestion path: /apps/push-eagle/pixel-events

## Added ingestion API
- Route: /api/storefront/pixel-events
- Proxy URL from storefront: /apps/push-eagle/pixel-events
- Events supported: page_view, product_view, add_to_cart, checkout_start

## Scopes required
- write_pixels
- read_customer_events

## Deploy and release
1. Run Shopify app deploy:
   - npx shopify app deploy --force
2. Confirm extension appears in Shopify admin:
   - Settings > Customer events > App pixels

## Connect app pixel for a store
Use Admin GraphQL webPixelCreate to create the pixel record after app install.

Example mutation:

mutation CreatePushEaglePixel($settings: JSON!) {
  webPixelCreate(webPixel: { settings: $settings }) {
    userErrors {
      field
      message
      code
    }
    webPixel {
      id
      settings
    }
  }
}

Example variables:
{
  "settings": "{\"endpointPath\":\"/apps/push-eagle/pixel-events\"}"
}

## Verify event flow
1. Open storefront and trigger page view, product view, add to cart, and checkout start.
2. Confirm server receives events in /api/storefront/pixel-events.
3. Confirm rows are written to subscriber_activity_events.
4. Confirm automation queue receives cart/checkout abandonment jobs for matching external IDs.

## Notes
- externalId priority: explicit payload > cart token > pixel clientId fallback.
- cart/checkouts webhooks remain active as backup signal paths.
- Pixel ingestion is best-effort and should not block page UX.
