'use client';

export type SerializableWizardState = {
  title: string;
  message: string;
  primaryLink: string;
  actionButtons: Array<{ title: string; link: string }>;
  windowsHeroPreview: string | null;
  macHeroPreview: string | null;
  androidHeroPreview: string | null;
  logoPreview: string | null;
  sendingOption: string;
  scheduledDateIso: string | null;
  scheduledTime: string;
  segmentId: string;
  smartDeliver: boolean;
  flashSaleEnabled: boolean;
  editingCampaignId: string | null;
};

const sessionKey = (shop: string) => `pe:campaign-wizard:${shop}`;

export const buildWizardPath = (
  path: string,
  shop: string,
  options?: { draft?: string; duplicate?: string },
) => {
  const params = new URLSearchParams();
  if (shop) {
    params.set('shop', shop);
  }
  if (options?.draft) {
    params.set('draft', options.draft);
  }
  if (options?.duplicate) {
    params.set('duplicate', options.duplicate);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

export const readWizardQueryParams = () => {
  if (typeof window === 'undefined') {
    return { shop: '', draftId: '', duplicateId: '' };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    shop: params.get('shop')?.trim().toLowerCase() ?? '',
    draftId: params.get('draft')?.trim() ?? '',
    duplicateId: params.get('duplicate')?.trim() ?? '',
  };
};

export const saveWizardSession = (shop: string, state: SerializableWizardState) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  try {
    sessionStorage.setItem(sessionKey(shop), JSON.stringify(state));
  } catch {
    // Ignore storage quota errors.
  }
};

export const loadWizardSession = (shop: string): SerializableWizardState | null => {
  if (typeof window === 'undefined' || !shop) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(sessionKey(shop));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SerializableWizardState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const clearWizardSession = (shop: string) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  try {
    sessionStorage.removeItem(sessionKey(shop));
  } catch {
    // Ignore storage errors.
  }
};

const parseActionButtons = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((button) => ({
      title: String((button as { title?: unknown }).title ?? '').trim(),
      link: String((button as { link?: unknown }).link ?? '').trim(),
    }))
    .filter((button) => button.title && button.link);
};

const formatScheduledTime = (date: Date) => {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${hours}:${String(minutes).padStart(2, '0')} ${meridiem}`;
};

export const mapCampaignRecordToWizardState = (
  campaign: Record<string, unknown>,
  options?: { editingCampaignId?: string | null },
): SerializableWizardState => {
  const scheduledRaw = campaign.scheduled_at ?? campaign.scheduledAt;
  const scheduledAt = scheduledRaw ? new Date(String(scheduledRaw)) : null;
  const hasSchedule = scheduledAt && !Number.isNaN(scheduledAt.getTime()) && String(campaign.status ?? '').toLowerCase() === 'scheduled';

  return {
    title: String(campaign.title ?? ''),
    message: String(campaign.body ?? ''),
    primaryLink: String(campaign.target_url ?? campaign.targetUrl ?? ''),
    actionButtons: parseActionButtons(campaign.action_buttons ?? campaign.actionButtons),
    windowsHeroPreview: (campaign.windows_image_url ?? campaign.windowsImageUrl ?? null) as string | null,
    macHeroPreview: (campaign.macos_image_url ?? campaign.macosImageUrl ?? null) as string | null,
    androidHeroPreview: (campaign.android_image_url ?? campaign.androidImageUrl ?? null) as string | null,
    logoPreview: (campaign.icon_url ?? campaign.iconUrl ?? null) as string | null,
    sendingOption: hasSchedule ? 'schedule' : 'now',
    scheduledDateIso: hasSchedule ? scheduledAt.toISOString() : null,
    scheduledTime: hasSchedule ? formatScheduledTime(scheduledAt) : '10:00 AM',
    segmentId: String(campaign.segment_id ?? campaign.segmentId ?? 'all') || 'all',
    smartDeliver: false,
    flashSaleEnabled: false,
    editingCampaignId: options?.editingCampaignId ?? null,
  };
};
