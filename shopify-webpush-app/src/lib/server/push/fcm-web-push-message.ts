type FcmWebPushAction = { action: string; title: string };

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
  const data: Record<string, string> = {
    title: input.title,
    body: input.body,
    icon: toFcmDataValue(input.iconUrl),
    image: toFcmDataValue(input.imageUrl),
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
