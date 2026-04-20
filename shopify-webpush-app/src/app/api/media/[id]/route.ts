import { NextResponse } from 'next/server';

import { getMediaAsset } from '@/lib/server/data/store';
import { getImageFromR2 } from '@/lib/server/media/r2';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const asset = await getMediaAsset(context.params.id);
    if (!asset) {
      return NextResponse.json({ ok: false, error: 'Media asset not found.' }, { status: 404 });
    }

    if (asset.object_key) {
      const r2Object = await getImageFromR2(asset.object_key);
      return new NextResponse(r2Object.bytes, {
        status: 200,
        headers: {
          'content-type': r2Object.contentType,
          'cache-control': r2Object.cacheControl,
        },
      });
    }

    if (!asset.data_base64) {
      return NextResponse.json({ ok: false, error: 'Media asset content not found.' }, { status: 404 });
    }

    const bytes = Buffer.from(asset.data_base64, 'base64');
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'content-type': asset.content_type,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load media asset.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
