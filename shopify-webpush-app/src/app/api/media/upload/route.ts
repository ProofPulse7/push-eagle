import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createMediaAsset,
  optimizeOversizedMediaAssets,
  pruneOrphanedMediaAssets,
} from '@/lib/server/data/store';
import { compressImageBytes } from '@/lib/server/media/image-compress';
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

  return { contentType, dataBase64 };
};

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin.replace(/\/$/, '');
    const body = schema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);

    const { contentType, dataBase64 } = parseDataUrl(body.dataUrl);
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

    await pruneOrphanedMediaAssets(shopDomain, 60).catch(() => undefined);
    await optimizeOversizedMediaAssets(shopDomain, 3).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      asset: {
        id: asset.id,
        url: uploaded.publicUrl || `${origin}/api/media/${asset.id}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload image asset.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
