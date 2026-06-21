import type { CampaignDraftSnapshot } from '@/lib/client/campaign-draft-storage';
import { writeCampaignDraft } from '@/lib/client/campaign-draft-storage';
import {
  buildCampaignDateTime,
  getDefaultCampaignScheduleDefaults,
  splitCampaignDateTime,
} from '@/lib/client/campaign-schedule';
import {
  buildDraftSnapshotFromSaveInput,
  fetchDraftCampaignWithRetry,
  findCachedDraftWizardSnapshot,
  resolvePersistedDraftCampaignId,
} from '@/lib/client/campaign-draft-cache';
import { applyLaunchMediaToCampaign } from '@/lib/client/campaign-launch-media-cache';
import { readOptimisticCampaignSnapshot } from '@/lib/client/optimistic-campaigns';
import { clearWizardLaunchMediaCache, prepareWizardLaunchMedia } from '@/lib/client/campaign-wizard-media';

type DuplicateCampaignRecord = {
  title?: string | null;
  body?: string | null;
  target_url?: string | null;
  targetUrl?: string | null;
  icon_url?: string | null;
  iconUrl?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  windows_image_url?: string | null;
  windowsImageUrl?: string | null;
  macos_image_url?: string | null;
  macosImageUrl?: string | null;
  android_image_url?: string | null;
  androidImageUrl?: string | null;
  action_buttons?: Array<{ title?: string; link?: string }> | null;
  actionButtons?: Array<{ title?: string; link?: string }> | null;
  segment_id?: string | null;
  segmentId?: string | null;
  status?: string | null;
  scheduled_at?: string | Date | null;
  scheduledAt?: string | Date | null;
  schedule_type?: string | null;
  scheduleType?: string | null;
  send_at?: string | Date | null;
  sendAt?: string | Date | null;
  smart_send_enabled?: boolean | null;
  smartSendEnabled?: boolean | null;
  flash_sale_enabled?: boolean | null;
  flashSaleEnabled?: boolean | null;
  flash_sale_ends_at?: string | Date | null;
  flashSaleEndsAt?: string | Date | null;
  flash_sale_config?: {
    discountPercent?: number;
    originalPrice?: number;
    salePrice?: number;
    expiresAt?: string | null;
    urgencyText?: string;
  } | null;
  flashSaleConfig?: {
    discountPercent?: number;
    originalPrice?: number;
    salePrice?: number;
    expiresAt?: string | null;
    urgencyText?: string;
  } | null;
};

const pick = <T,>(...values: Array<T | null | undefined>): T | null => {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
};

const stripFlashSaleUrgency = (body: string, urgencyText?: string | null) => {
  const urgency = urgencyText?.trim() || '⏰ Limited time offer!';
  const trimmed = body.trim();
  if (!trimmed.endsWith(urgency)) {
    return trimmed;
  }

  return trimmed.slice(0, Math.max(0, trimmed.length - urgency.length)).replace(/\n\n$/, '').trim();
};

const resolveScheduleFields = (campaign: DuplicateCampaignRecord) => {
  const defaults = getDefaultCampaignScheduleDefaults();
  const scheduleType = String(pick(campaign.schedule_type, campaign.scheduleType) ?? '').toLowerCase();
  const status = String(campaign.status ?? '').toLowerCase();
  const scheduledAtRaw = pick(campaign.scheduled_at, campaign.scheduledAt, campaign.send_at, campaign.sendAt);
  const wasScheduled = scheduleType === 'scheduled' || status === 'scheduled';

  if (!wasScheduled) {
    return {
      sendingOption: 'now',
      scheduledDate: defaults.scheduledDate,
      scheduledTime: defaults.scheduledTime,
    };
  }

  if (!scheduledAtRaw) {
    return {
      sendingOption: 'schedule',
      scheduledDate: defaults.scheduledDate,
      scheduledTime: defaults.scheduledTime,
    };
  }

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    return {
      sendingOption: 'schedule',
      scheduledDate: defaults.scheduledDate,
      scheduledTime: defaults.scheduledTime,
    };
  }

  const split = splitCampaignDateTime(scheduledAt);
  return {
    sendingOption: 'schedule',
    scheduledDate: split.date,
    scheduledTime: split.time,
  };
};

const resolveFlashSaleFields = (campaign: DuplicateCampaignRecord) => {
  const defaults = getDefaultCampaignScheduleDefaults();
  const flashSaleEnabled = Boolean(pick(campaign.flash_sale_enabled, campaign.flashSaleEnabled));
  const flashConfig = (campaign.flash_sale_config ?? campaign.flashSaleConfig ?? {}) as NonNullable<
    DuplicateCampaignRecord['flash_sale_config']
  >;
  const expiresAtRaw = pick(campaign.flash_sale_ends_at, campaign.flashSaleEndsAt, flashConfig.expiresAt);

  if (!flashSaleEnabled) {
    return {
      flashSaleEnabled: false,
      flashSaleDiscountPercent: Number(flashConfig.discountPercent ?? 20),
      flashSaleOriginalPrice: Number(flashConfig.originalPrice ?? 0),
      flashSaleSalePrice: Number(flashConfig.salePrice ?? 0),
      flashSaleExpiresAt: defaults.flashSaleExpiresAt,
      flashSaleExpiresTime: defaults.flashSaleExpiresTime,
      flashSaleUrgencyText: flashConfig.urgencyText?.trim() || '⏰ Limited time offer!',
    };
  }

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  const validExpiry = expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now()
    ? splitCampaignDateTime(expiresAt)
    : null;

  return {
    flashSaleEnabled: true,
    flashSaleDiscountPercent: Number(flashConfig.discountPercent ?? 20),
    flashSaleOriginalPrice: Number(flashConfig.originalPrice ?? 0),
    flashSaleSalePrice: Number(flashConfig.salePrice ?? 0),
    flashSaleExpiresAt: validExpiry?.date ?? defaults.flashSaleExpiresAt,
    flashSaleExpiresTime: validExpiry?.time ?? defaults.flashSaleExpiresTime,
    flashSaleUrgencyText: flashConfig.urgencyText?.trim() || '⏰ Limited time offer!',
  };
};

export const buildDraftFromCampaign = (campaign: DuplicateCampaignRecord): CampaignDraftSnapshot => {
  const flashFields = resolveFlashSaleFields(campaign);
  const scheduleFields = resolveScheduleFields(campaign);
  const urgencyText = flashFields.flashSaleUrgencyText;
  const rawBody = String(campaign.body ?? '');
  const message = flashFields.flashSaleEnabled ? stripFlashSaleUrgency(rawBody, urgencyText) : rawBody;

  const iconUrl = pick(campaign.icon_url, campaign.iconUrl);
  const windowsImageUrl = pick(campaign.windows_image_url, campaign.windowsImageUrl);
  const macosImageUrl = pick(campaign.macos_image_url, campaign.macosImageUrl);
  const androidImageUrl = pick(campaign.android_image_url, campaign.androidImageUrl);
  const listImageUrl = pick(campaign.image_url, campaign.imageUrl, macosImageUrl, windowsImageUrl, androidImageUrl);

  const actionButtons = (campaign.action_buttons ?? campaign.actionButtons ?? [])
    .filter((button) => button?.title?.trim() && button?.link?.trim())
    .map((button) => ({
      title: String(button.title).trim(),
      link: String(button.link).trim(),
    }));

  return {
    draftCampaignId: null,
    title: String(campaign.title ?? ''),
    message,
    primaryLink: String(pick(campaign.target_url, campaign.targetUrl) ?? ''),
    actionButtons,
    windowsHero: { preview: windowsImageUrl, originalPreview: windowsImageUrl },
    macHero: { preview: macosImageUrl ?? listImageUrl, originalPreview: macosImageUrl ?? listImageUrl },
    androidHero: { preview: androidImageUrl, originalPreview: androidImageUrl },
    logo: { preview: iconUrl, originalPreview: iconUrl },
    sendingOption: scheduleFields.sendingOption,
    scheduledDate: scheduleFields.scheduledDate.toISOString(),
    scheduledTime: scheduleFields.scheduledTime,
    segmentId: String(pick(campaign.segment_id, campaign.segmentId) ?? 'all'),
    smartDeliver: Boolean(pick(campaign.smart_send_enabled, campaign.smartSendEnabled)),
    flashSaleEnabled: flashFields.flashSaleEnabled,
    flashSaleDiscountPercent: flashFields.flashSaleDiscountPercent,
    flashSaleOriginalPrice: flashFields.flashSaleOriginalPrice,
    flashSaleSalePrice: flashFields.flashSaleSalePrice,
    flashSaleExpiresAt: flashFields.flashSaleExpiresAt.toISOString(),
    flashSaleExpiresTime: flashFields.flashSaleExpiresTime,
    flashSaleUrgencyText: flashFields.flashSaleUrgencyText,
    recurringPattern: '',
    updatedAt: Date.now(),
  };
};

const buildWizardLinks = (shopDomain: string) => ({
  detailsHref: `/campaigns/new/details?shop=${encodeURIComponent(shopDomain)}`,
  editorHref: `/campaigns/new/editor?shop=${encodeURIComponent(shopDomain)}`,
  scheduleHref: `/campaigns/new/schedule?shop=${encodeURIComponent(shopDomain)}`,
});

const hydrateDraftWizard = async (
  shopDomain: string,
  campaignId: string,
  draft: CampaignDraftSnapshot,
) => {
  clearWizardLaunchMediaCache(shopDomain);
  writeCampaignDraft(shopDomain, draft);

  await prepareWizardLaunchMedia(shopDomain, {
    imageUrl: draft.macHero.preview ?? draft.windowsHero.preview ?? draft.androidHero.preview,
    windowsImageUrl: draft.windowsHero.preview,
    macosImageUrl: draft.macHero.preview,
    androidImageUrl: draft.androidHero.preview,
    iconUrl: draft.logo.preview,
  }).catch(() => undefined);

  return {
    draft,
    campaignId: resolvePersistedDraftCampaignId(shopDomain, campaignId),
    ...buildWizardLinks(shopDomain),
  };
};

export const duplicateCampaignToWizard = async (shopDomain: string, campaignId: string) => {
  const campaign = await fetchDraftCampaignWithRetry(shopDomain, campaignId, 1);
  const draft = buildDraftFromCampaign(campaign as DuplicateCampaignRecord);
  const hydrated = await hydrateDraftWizard(shopDomain, campaignId, draft);

  const scheduledAt = buildCampaignDateTime(
    new Date(draft.scheduledDate ?? Date.now()),
    draft.scheduledTime,
  );

  return {
    ...hydrated,
    scheduledAt,
  };
};

export const editDraftCampaignToWizard = async (shopDomain: string, campaignId: string) => {
  const cachedSnapshot = findCachedDraftWizardSnapshot(shopDomain, campaignId);
  if (cachedSnapshot) {
    const draft = buildDraftSnapshotFromSaveInput(cachedSnapshot, campaignId);
    return hydrateDraftWizard(shopDomain, campaignId, draft);
  }

  const pinnedSnapshot = readOptimisticCampaignSnapshot(shopDomain, campaignId);
  if (pinnedSnapshot && String(pinnedSnapshot.status ?? 'draft').toLowerCase() === 'draft') {
    const enriched = applyLaunchMediaToCampaign(shopDomain, pinnedSnapshot);
    const draft = {
      ...buildDraftFromCampaign(enriched as DuplicateCampaignRecord),
      draftCampaignId: resolvePersistedDraftCampaignId(shopDomain, campaignId),
    };
    return hydrateDraftWizard(shopDomain, campaignId, draft);
  }

  const campaign = await fetchDraftCampaignWithRetry(shopDomain, campaignId);
  if (String(campaign.status ?? '').toLowerCase() !== 'draft') {
    throw new Error('Only draft campaigns can be edited.');
  }

  const draft = {
    ...buildDraftFromCampaign(campaign as DuplicateCampaignRecord),
    draftCampaignId: resolvePersistedDraftCampaignId(shopDomain, campaignId),
  };

  return hydrateDraftWizard(shopDomain, campaignId, draft);
};
