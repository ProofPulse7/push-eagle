import { clearCampaignDraft } from '@/lib/client/campaign-draft-storage';
import { clearWizardLaunchMediaCache } from '@/lib/client/campaign-wizard-media';

export const buildNewCampaignHref = (shopDomain?: string) => {
  const params = new URLSearchParams({ new: '1' });
  if (shopDomain?.trim()) {
    params.set('shop', shopDomain.trim().toLowerCase());
  }
  return `/campaigns/new/details?${params.toString()}`;
};

export const beginFreshCampaignSession = (shopDomain: string) => {
  clearCampaignDraft(shopDomain);
  clearWizardLaunchMediaCache(shopDomain);
};
