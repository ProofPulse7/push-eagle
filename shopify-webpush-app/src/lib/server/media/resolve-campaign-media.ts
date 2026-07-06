import { env } from '@/lib/config/env';
import { createMediaAsset } from '@/lib/server/data/store';
import { compressImageBytes } from '@/lib/server/media/image-compress';
import { uploadImageToR2 } from '@/lib/server/media/r2';

const appMediaBaseUrl = () =>
  (env.SHOPIFY_ROOT_APP_URL || env.NEXT_PUBLIC_APP_URL || 'https://push-eagle.vercel.app').replace(/\/$/, '');

const toAbsoluteAppMediaUrl = (value: string): string => {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  const path = value.startsWith('/') ? value : `/${value}`;
  return `${appMediaBaseUrl()}${path}`;
};

const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Unsupported media format. Expected data:image/*;base64 payload.');
  }

  const contentType = match[1];
  const dataBase64 = match[2];

  return { contentType, dataBase64 };
};

export const resolveServerCampaignMediaUrl = async (
  shopDomain: string,
  value: string | null | undefined,
): Promise<string | null> => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (!trimmed.startsWith('data:image/')) {
    return null;
  }

  const { contentType, dataBase64 } = parseDataUrl(trimmed);
  const rawBytes = Buffer.from(dataBase64, 'base64');
  const compressed = await compressImageBytes(rawBytes, contentType, 'hero');

  const uploaded = await uploadImageToR2({
    shopDomain,
    contentType: compressed.contentType,
    bytes: compressed.bytes,
  });
  const asset = await createMediaAsset({
    shopDomain,
    contentType: compressed.contentType,
    objectKey: uploaded.objectKey,
    publicUrl: uploaded.publicUrl,
  });

  return uploaded.publicUrl || toAbsoluteAppMediaUrl(`/api/media/${asset.id}`);
};
