import { createMediaAsset } from '@/lib/server/data/store';
import { uploadImageToR2 } from '@/lib/server/media/r2';

const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Unsupported media format. Expected data:image/*;base64 payload.');
  }

  const contentType = match[1];
  const dataBase64 = match[2];
  const byteSize = Math.floor((dataBase64.length * 3) / 4);

  return { contentType, dataBase64, byteSize };
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

  const { contentType, dataBase64, byteSize } = parseDataUrl(trimmed);
  if (byteSize > 2 * 1024 * 1024) {
    throw new Error('Image too large. Max size is 2MB.');
  }

  const bytes = Buffer.from(dataBase64, 'base64');
  const uploaded = await uploadImageToR2({
    shopDomain,
    contentType,
    bytes,
  });
  const asset = await createMediaAsset({
    shopDomain,
    contentType,
    objectKey: uploaded.objectKey,
    publicUrl: uploaded.publicUrl,
  });

  return uploaded.publicUrl || `/api/media/${asset.id}`;
};
