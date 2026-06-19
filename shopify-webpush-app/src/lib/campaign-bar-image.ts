const CAMPAIGN_BAR_RATIO = 160 / 96;

const DEVICE_IMAGE_RATIOS = {
  windows: 728 / 360,
  macos: 704 / 512,
  android: 720 / 240,
} as const;

export type CampaignDeviceImages = {
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
};

export const pickCampaignBarImageUrl = (images: CampaignDeviceImages): string | null => {
  const candidates: Array<{ url: string; ratio: number }> = [];

  if (images.windowsImageUrl?.trim()) {
    candidates.push({ url: images.windowsImageUrl.trim(), ratio: DEVICE_IMAGE_RATIOS.windows });
  }
  if (images.macosImageUrl?.trim()) {
    candidates.push({ url: images.macosImageUrl.trim(), ratio: DEVICE_IMAGE_RATIOS.macos });
  }
  if (images.androidImageUrl?.trim()) {
    candidates.push({ url: images.androidImageUrl.trim(), ratio: DEVICE_IMAGE_RATIOS.android });
  }
  if (images.imageUrl?.trim()) {
    candidates.push({ url: images.imageUrl.trim(), ratio: DEVICE_IMAGE_RATIOS.macos });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(
    (left, right) =>
      Math.abs(left.ratio - CAMPAIGN_BAR_RATIO) - Math.abs(right.ratio - CAMPAIGN_BAR_RATIO),
  );

  return candidates[0]?.url ?? null;
};
