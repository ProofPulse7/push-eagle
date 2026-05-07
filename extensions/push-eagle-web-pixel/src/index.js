import { register } from '@shopify/web-pixels-extension';

// Keep the app pixel loaded but inert. Storefront and webhook pipelines
// remain the authoritative automation sources.
register(() => {});
