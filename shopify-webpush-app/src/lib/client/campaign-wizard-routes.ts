export const CAMPAIGN_WIZARD_STEP_PATHS = [
  '/campaigns/new/details',
  '/campaigns/new/editor',
  '/campaigns/new/schedule',
] as const;

export type CampaignWizardStepPath = (typeof CAMPAIGN_WIZARD_STEP_PATHS)[number];

export const isCampaignWizardStepPath = (pathname: string): pathname is CampaignWizardStepPath =>
  (CAMPAIGN_WIZARD_STEP_PATHS as readonly string[]).includes(pathname);

export const isCampaignWizardRoute = (pathname: string) =>
  pathname === '/campaigns/new' || isCampaignWizardStepPath(pathname);

export const FRESH_CAMPAIGN_QUERY_PARAM = 'fresh';

export const buildNewCampaignHref = (shop?: string) => {
  const params = new URLSearchParams();
  params.set(FRESH_CAMPAIGN_QUERY_PARAM, '1');
  if (shop?.trim()) {
    params.set('shop', shop.trim());
  }
  return `/campaigns/new/details?${params.toString()}`;
};
