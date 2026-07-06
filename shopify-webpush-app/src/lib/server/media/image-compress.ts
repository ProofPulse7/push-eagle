import sharp from 'sharp';

export type ServerImageProfile = 'hero' | 'logo' | 'storage';

type ServerProfileConfig = {
  maxWidth: number;
  maxHeight: number;
  targetBytes: number;
  quality: number;
};

const PROFILES: Record<ServerImageProfile, ServerProfileConfig> = {
  hero: {
    maxWidth: 1200,
    maxHeight: 1200,
    targetBytes: 280_000,
    quality: 82,
  },
  logo: {
    maxWidth: 512,
    maxHeight: 512,
    targetBytes: 70_000,
    quality: 85,
  },
  storage: {
    maxWidth: 1200,
    maxHeight: 1200,
    targetBytes: 180_000,
    quality: 78,
  },
};

const OPTIMIZE_THRESHOLD_BYTES = 200_000;

export const shouldOptimizeStoredImage = (byteSize: number) => byteSize > OPTIMIZE_THRESHOLD_BYTES;

const compressWithProfile = async (
  bytes: Buffer,
  profile: ServerImageProfile,
): Promise<{ bytes: Buffer; contentType: string }> => {
  const config = PROFILES[profile];
  let quality = config.quality;
  let best: { bytes: Buffer; contentType: string } | null = null;

  const pipeline = sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({
      width: config.maxWidth,
      height: config.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    });

  while (quality >= 52) {
    const output = await pipeline
      .clone()
      .webp({ quality, effort: 4 })
      .toBuffer();

    best = { bytes: output, contentType: 'image/webp' };
    if (output.length <= config.targetBytes) {
      return best;
    }
    quality -= 8;
  }

  if (!best) {
    const fallback = await pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    return { bytes: fallback, contentType: 'image/jpeg' };
  }

  return best;
};

export const compressImageBytes = async (
  bytes: Buffer,
  contentType: string,
  profile: ServerImageProfile = 'hero',
): Promise<{ bytes: Buffer; contentType: string }> => {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.includes('svg') || normalizedType.includes('gif')) {
    return { bytes, contentType };
  }

  if (bytes.length <= PROFILES[profile].targetBytes) {
    return { bytes, contentType };
  }

  try {
    return await compressWithProfile(bytes, profile);
  } catch {
    return { bytes, contentType };
  }
};

export const compressStoredImageBytes = async (
  bytes: Buffer,
  contentType: string,
): Promise<{ bytes: Buffer; contentType: string; optimized: boolean }> => {
  if (!shouldOptimizeStoredImage(bytes.length)) {
    return { bytes, contentType, optimized: false };
  }

  const compressed = await compressImageBytes(bytes, contentType, 'storage');
  const optimized = compressed.bytes.length < bytes.length;
  return { ...compressed, optimized };
};
