export type CampaignDraftImage = {
  preview: string | null;
  originalPreview?: string | null;
};

export type CampaignDraftActionButton = {
  title: string;
  link: string;
};

export type CampaignDraftSnapshot = {
  title: string;
  message: string;
  primaryLink: string;
  actionButtons: CampaignDraftActionButton[];
  windowsHero: CampaignDraftImage;
  macHero: CampaignDraftImage;
  androidHero: CampaignDraftImage;
  logo: CampaignDraftImage;
  sendingOption: string;
  scheduledDate: string | null;
  scheduledTime: string;
  segmentId: string;
  smartDeliver: boolean;
  flashSaleEnabled: boolean;
  flashSaleDiscountPercent: number;
  flashSaleOriginalPrice: number;
  flashSaleSalePrice: number;
  flashSaleExpiresAt: string | null;
  flashSaleUrgencyText: string;
  recurringPattern: string;
  updatedAt: number;
};

const draftKey = (shop: string) => `pe:campaign-draft:${shop.trim().toLowerCase()}`;
export const CAMPAIGN_WIZARD_ACTIVE_KEY = 'pe:campaign-wizard-active';

export const readCampaignDraft = (shop: string): CampaignDraftSnapshot | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(draftKey(shop));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CampaignDraftSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const writeCampaignDraft = (shop: string, draft: CampaignDraftSnapshot) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.setItem(
      draftKey(shop),
      JSON.stringify({ ...draft, updatedAt: Date.now() }),
    );
    sessionStorage.setItem(CAMPAIGN_WIZARD_ACTIVE_KEY, '1');
  } catch {
    // Ignore quota errors.
  }
};

export const clearCampaignDraft = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.removeItem(draftKey(shop));
    sessionStorage.removeItem(CAMPAIGN_WIZARD_ACTIVE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

export const isCampaignWizardActive = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return sessionStorage.getItem(CAMPAIGN_WIZARD_ACTIVE_KEY) === '1';
};
