import { register } from '@shopify/web-pixels-extension';

register(() => {
  // Intentionally no-op: abandoned-cart and welcome automations are driven by
  // storefront + webhook activity signals, and this avoids strict runtime noise.
});
