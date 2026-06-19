/**
 * Temporary UI lock for automations not yet launched.
 * Restore full access: `npm run automations:unlock`
 * Re-enable lock: `npm run automations:lock`
 */
export const COMING_SOON_AUTOMATIONS_ENABLED = true;

export const COMING_SOON_AUTOMATION_RULE_KEYS = [
  'browse_abandonment_15m',
  'shipping_notifications',
  'back_in_stock',
  'price_drop',
] as const;

export type ComingSoonAutomationRuleKey = (typeof COMING_SOON_AUTOMATION_RULE_KEYS)[number];

export const isComingSoonAutomation = (ruleKey: string) =>
  COMING_SOON_AUTOMATIONS_ENABLED &&
  (COMING_SOON_AUTOMATION_RULE_KEYS as readonly string[]).includes(ruleKey);
