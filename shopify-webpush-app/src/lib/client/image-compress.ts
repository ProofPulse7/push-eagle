'use client';

export type ImageCompressProfile = 'hero' | 'logo';

type ProfileConfig = {
  maxWidth: number;
  maxHeight: number;
  targetBytes: number;
  startQuality: number;
  minQuality: number;
};

const PROFILES: Record<ImageCompressProfile, ProfileConfig> = {
  hero: {
    maxWidth: 1200,
    maxHeight: 1200,
    targetBytes: 320_000,
    startQuality: 0.88,
    minQuality: 0.55,
  },
  logo: {
    maxWidth: 512,
    maxHeight: 512,
    targetBytes: 80_000,
    startQuality: 0.9,
    minQuality: 0.6,
  },
};

const OUTPUT_MIME_TYPES = ['image/webp', 'image/jpeg'] as const;

let preferredOutputMime: (typeof OUTPUT_MIME_TYPES)[number] | null = null;

const detectPreferredOutputMime = (): (typeof OUTPUT_MIME_TYPES)[number] => {
  if (preferredOutputMime) {
    return preferredOutputMime;
  }

  if (typeof document === 'undefined') {
    preferredOutputMime = 'image/jpeg';
    return preferredOutputMime;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  preferredOutputMime = canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';
  return preferredOutputMime;
};

const loadImageElement = (source: string | File | Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
    const shouldRevoke = typeof source !== 'string';

    img.onload = () => {
      if (shouldRevoke) {
        URL.revokeObjectURL(objectUrl);
      }
      resolve(img);
    };
    img.onerror = () => {
      if (shouldRevoke) {
        URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('Failed to load image for compression.'));
    };
    img.src = objectUrl;
  });

const fitDimensions = (
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) => {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
};

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image compression failed.'))),
      mime,
      quality,
    );
  });

const drawToCanvas = (img: HTMLImageElement, profile: ProfileConfig) => {
  const { width, height } = fitDimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    profile.maxWidth,
    profile.maxHeight,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas is not available.');
  }

  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read compressed image.'));
    reader.readAsDataURL(blob);
  });

const compressCanvasToTarget = async (canvas: HTMLCanvasElement, profile: ProfileConfig) => {
  const mime = detectPreferredOutputMime();
  let quality = profile.startQuality;
  let bestBlob: Blob | null = null;

  while (quality >= profile.minQuality) {
    const blob = await canvasToBlob(canvas, mime, quality);
    bestBlob = blob;
    if (blob.size <= profile.targetBytes) {
      break;
    }
    quality -= 0.07;
  }

  if (!bestBlob) {
    throw new Error('Image compression failed.');
  }

  const extension = mime === 'image/webp' ? 'webp' : 'jpg';
  const file = new File([bestBlob], `compressed.${extension}`, { type: mime });
  const blobUrl = URL.createObjectURL(bestBlob);
  const dataUrl = await blobToDataUrl(bestBlob);

  return { file, blobUrl, dataUrl, byteSize: bestBlob.size };
};

export type CompressedImageResult = {
  file: File;
  blobUrl: string;
  dataUrl: string;
  byteSize: number;
};

export const compressImageFile = async (
  file: File,
  profile: ImageCompressProfile = 'hero',
): Promise<CompressedImageResult> => {
  const config = PROFILES[profile];
  const img = await loadImageElement(file);
  const canvas = drawToCanvas(img, config);
  return compressCanvasToTarget(canvas, config);
};

export const compressDataUrl = async (
  dataUrl: string,
  profile: ImageCompressProfile = 'hero',
): Promise<string> => {
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  const estimatedBytes = Math.floor((dataUrl.length * 3) / 4);
  const config = PROFILES[profile];
  if (estimatedBytes <= config.targetBytes) {
    return dataUrl;
  }

  try {
    const img = await loadImageElement(dataUrl);
    const canvas = drawToCanvas(img, config);
    const compressed = await compressCanvasToTarget(canvas, config);
    URL.revokeObjectURL(compressed.blobUrl);
    return compressed.dataUrl;
  } catch {
    return dataUrl;
  }
};

export const createInstantPreviewUrl = (file: File) => URL.createObjectURL(file);

export const revokePreviewUrl = (url: string | null | undefined) => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

export const estimateDataUrlBytes = (dataUrl: string) =>
  Math.floor((dataUrl.length * 3) / 4);

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

/** Stable data URL for the crop editor (avoids revoked blob URLs). */
export const resolveImageCropSource = async (image: {
  file: File | null;
  preview: string | null;
  originalPreview?: string | null;
}): Promise<string | null> => {
  const original = image.originalPreview?.trim();
  if (original?.startsWith('data:image/')) {
    return original;
  }

  if (image.file) {
    return fileToDataUrl(image.file);
  }

  const preview = image.preview?.trim();
  if (!preview) {
    return null;
  }

  if (preview.startsWith('data:image/')) {
    return preview;
  }

  try {
    const response = await fetch(preview);
    const blob = await response.blob();
    return fileToDataUrl(new File([blob], 'crop-source', { type: blob.type || 'image/jpeg' }));
  } catch {
    return null;
  }
};
