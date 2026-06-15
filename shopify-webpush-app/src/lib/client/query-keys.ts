export const queryKeys = {
  bootstrap: (shop: string) => ['pe', shop, 'bootstrap'] as const,
  merchantOverview: (shop: string) => ['pe', shop, 'settings', 'overview'] as const,
  attribution: (shop: string) => ['pe', shop, 'settings', 'attribution'] as const,
  privacy: (shop: string) => ['pe', shop, 'settings', 'privacy'] as const,
  branding: (shop: string) => ['pe', shop, 'settings', 'branding'] as const,
  optIn: (shop: string) => ['pe', shop, 'settings', 'opt-in'] as const,
  campaigns: (shop: string) => ['pe', shop, 'campaigns'] as const,
  campaignStats: (shop: string, from: string, to: string) =>
    ['pe', shop, 'campaigns', 'stats', from, to] as const,
  automationsOverview: (shop: string) => ['pe', shop, 'automations', 'overview'] as const,
  automationStats: (shop: string, from: string, to: string) =>
    ['pe', shop, 'automations', 'stats', from, to] as const,
  segments: (shop: string) => ['pe', shop, 'segments'] as const,
  subscribersOverview: (shop: string) => ['pe', shop, 'subscribers', 'overview'] as const,
  subscribersGrowth: (shop: string, from: string, to: string) =>
    ['pe', shop, 'subscribers', 'growth', from, to] as const,
  subscribersList: (shop: string, limit: number, offset: number, sort: string) =>
    ['pe', shop, 'subscribers', 'list', limit, offset, sort] as const,
  analyticsStats: (shop: string, from: string, to: string) =>
    ['pe', shop, 'analytics', 'stats', from, to] as const,
  dashboardSummary: (shop: string) => ['pe', shop, 'dashboard', 'summary'] as const,
  billingStatus: (shop: string) => ['pe', shop, 'billing', 'status'] as const,
};
