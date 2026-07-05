type FcmWebPushAction = { action: string; title: string };

export type CampaignDeviceImages = {
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
};

export const absolutizeNotificationMediaUrl = (
  url: string | null | undefined,
  appBaseUrl: string,
): string | null => {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).toString();
    }

    const base = appBaseUrl.replace(/\/$/, '');
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return new URL(path, `${base}/`).toString();
  } catch {
    return null;
  }
};

const pickImageUrl = (...candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) {
      return value;
    }
  }
  return null;
};

/** Pick the hero image for a campaign notification based on device signals. */
export const selectCampaignImageForDevice = (
  campaign: CampaignDeviceImages,
  platform?: string | null,
  userAgent?: string | null,
): string | null => {
  const device = `${String(platform ?? '').toLowerCase()} ${String(userAgent ?? '').toLowerCase()}`.trim();

  if (device.includes('android')) {
    return pickImageUrl(campaign.androidImageUrl, campaign.imageUrl);
  }

  if (device.includes('windows')) {
    return pickImageUrl(campaign.windowsImageUrl, campaign.imageUrl);
  }

  if (
    device.includes('mac')
    || device.includes('osx')
    || device.includes('iphone')
    || device.includes('ipad')
    || device.includes('ios')
    || device.includes('safari')
  ) {
    return pickImageUrl(campaign.macosImageUrl, campaign.imageUrl);
  }

  return pickImageUrl(
    campaign.imageUrl,
    campaign.macosImageUrl,
    campaign.windowsImageUrl,
    campaign.androidImageUrl,
  );
};

export type FcmWebPushMessageInput = {
  token: string;
  title: string;
  body: string;
  iconUrl?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  campaignId?: string;
  shopDomain?: string;
  primaryUrl?: string;
  button1Url?: string | null;
  button2Url?: string | null;
  trackPrimaryUrl?: string;
  trackButton1Url?: string;
  trackButton2Url?: string;
  action1Title?: string;
  action2Title?: string;
  tag?: string;
  extraData?: Record<string, string>;
};

const toFcmDataValue = (value: unknown) => (value == null ? '' : String(value));

/**
 * Build a data-only FCM web push message so the service worker shows exactly one notification.
 * Avoid top-level `notification` and `webpush.notification` — those cause duplicate displays
 * when combined with firebase.messaging() and a custom push handler.
 */
export const buildFcmDataOnlyWebPushMessage = (input: FcmWebPushMessageInput) => {
  const imageUrl = String(input.imageUrl ?? '').trim();
  const iconUrl = String(input.iconUrl ?? '').trim();

  const data: Record<string, string> = {
    title: input.title,
    body: input.body,
    icon: iconUrl,
    ...(imageUrl ? { image: imageUrl } : {}),
    url: toFcmDataValue(input.linkUrl ?? input.primaryUrl),
    primaryUrl: toFcmDataValue(input.primaryUrl ?? input.linkUrl),
    button1Url: toFcmDataValue(input.button1Url),
    button2Url: toFcmDataValue(input.button2Url),
    trackPrimaryUrl: toFcmDataValue(input.trackPrimaryUrl),
    trackButton1Url: toFcmDataValue(input.trackButton1Url),
    trackButton2Url: toFcmDataValue(input.trackButton2Url),
    action1Title: toFcmDataValue(input.action1Title),
    action2Title: toFcmDataValue(input.action2Title),
    campaignId: toFcmDataValue(input.campaignId ?? input.tag),
    shopDomain: toFcmDataValue(input.shopDomain),
    tag: toFcmDataValue(input.tag ?? input.campaignId),
    ...(input.extraData ?? {}),
  };

  return {
    token: input.token,
    data,
    webpush: {
      fcmOptions: {
        link: input.linkUrl ?? input.primaryUrl ?? undefined,
      },
    },
  };
};
