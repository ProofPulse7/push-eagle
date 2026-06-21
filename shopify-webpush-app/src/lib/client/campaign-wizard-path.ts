export const CAMPAIGN_WIZARD_STEPS = [
  '/campaigns/new/details',
  '/campaigns/new/editor',
  '/campaigns/new/schedule',
] as const;

export type CampaignWizardStep = (typeof CAMPAIGN_WIZARD_STEPS)[number];

export const getCampaignWizardPathname = (pathname: string) => pathname.split('?')[0] ?? pathname;

export const isCampaignWizardStep = (pathname: string) =>
  CAMPAIGN_WIZARD_STEPS.includes(getCampaignWizardPathname(pathname) as CampaignWizardStep);
