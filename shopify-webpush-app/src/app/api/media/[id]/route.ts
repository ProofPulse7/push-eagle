import { NextResponse } from 'next/server';

import { getMediaAsset } from '@/lib/server/data/store';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const asset = await getMediaAsset(context.params.id);
    if (!asset) {
      return NextResponse.json({ ok: false, error: 'Media asset not found.' }, { status: 404 });
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
