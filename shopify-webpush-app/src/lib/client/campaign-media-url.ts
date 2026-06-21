const sanitizeMediaUrl = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return null;
  }

  return trimmed;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });

export const resolveCampaignMediaUrl = async (
  sourceUrl: string | null | undefined,
  shopDomain: string,
): Promise<string | null> => {
  const direct = sanitizeMediaUrl(sourceUrl);
  if (direct) {
    return direct;
  }

  const value = sourceUrl?.trim();
  if (!value) {
    return null;
  }

  let dataUrl = value;
  if (value.startsWith('blob:')) {
    const response = await fetch(value);
    const blob = await response.blob();
    dataUrl = await blobToDataUrl(blob);
  }

  if (!dataUrl.startsWith('data:image/')) {
    return null;
  }

  const uploadResponse = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain, dataUrl }),
  });

  const uploadPayload = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || !uploadPayload?.ok || !uploadPayload?.asset?.url) {
    const message =
      uploadPayload && typeof uploadPayload === 'object' && typeof uploadPayload.error === 'string'
        ? uploadPayload.error
        : uploadResponse.statusText || 'Failed to upload campaign image.';
    throw new Error(message);
  }

  return String(uploadPayload.asset.url);
};
