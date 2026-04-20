import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createMediaAsset } from '@/lib/server/data/store';
import { uploadImageToR2 } from '@/lib/server/media/r2';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({
  shopDomain: z.string().optional(),
  dataUrl: z.string().min(20),
});

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

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);

    const { contentType, dataBase64, byteSize } = parseDataUrl(body.dataUrl);
    if (byteSize > 2 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'Image too large. Max size is 2MB.' }, { status: 413 });
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

    return NextResponse.json({
      ok: true,
      asset: {
        id: asset.id,
        url: asset.url,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload image asset.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
