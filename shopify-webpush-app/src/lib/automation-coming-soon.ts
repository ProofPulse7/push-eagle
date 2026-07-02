/**
 * Automations hidden during Shopify App Store review.
 *
 * Restore full merchant UI + sends after approval:
 *   npm run automations:unlock
 *   git commit && deploy
 *
 * Config, flow pages, and webhook handlers stay in place — only UI/API/middleware
 * and runtime sends are gated while COMING_SOON_AUTOMATIONS_ENABLED is true.
 */
export const COMING_SOON_AUTOMATIONS_ENABLED = false;

export const COMING_SOON_AUTOMATION_RULE_KEYS = [
  'browse_abandonment_15m',
  'shipping_notifications',
  'back_in_stock',
  'price_drop',
] as const;

export type ComingSoonAutomationRuleKey = (typeof COMING_SOON_AUTOMATION_RULE_KEYS)[number];

export const COMING_SOON_AUTOMATION_PATH_PREFIXES = [
  '/automations/browse-abandonment',
  '/automations/shipping-notifications',
  '/automations/back-in-stock',
  '/automations/price-drop',
] as const;

export const isComingSoonAutomation = (ruleKey: string) =>
  COMING_SOON_AUTOMATIONS_ENABLED &&
  (COMING_SOON_AUTOMATION_RULE_KEYS as readonly string[]).includes(ruleKey);

export const isComingSoonAutomationPath = (pathname: string) =>
  COMING_SOON_AUTOMATIONS_ENABLED &&
  COMING_SOON_AUTOMATION_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
