import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ensureMerchantAccount } from '@/lib/server/data/store';
import {
  createSegmentCustomAttribute,
  deleteSegmentCustomAttribute,
  listSegmentCustomAttributes,
} from '@/lib/server/segment-custom-attributes';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const attributeTypeSchema = z.enum(['text', 'number', 'date', 'category', 'multiple-choice']);

const createAttributeSchema = z.object({
  shopDomain: z.string().optional(),
  name: z.string().min(1),
  type: attributeTypeSchema,
  options: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    await ensureMerchantAccount(shopDomain);
    const attributes = await listSegmentCustomAttributes(shopDomain);
    return NextResponse.json({ ok: true, attributes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load custom attributes.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = createAttributeSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    await ensureMerchantAccount(shopDomain);
    const attribute = await createSegmentCustomAttribute(shopDomain, {
      name: body.name,
      type: body.type,
      options: body.options,
    });
    return NextResponse.json({ ok: true, attribute });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create custom attribute.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get('name')?.trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: 'Attribute name is required.' }, { status: 400 });
    }

    const shopDomain = extractShopDomain(request);
    await ensureMerchantAccount(shopDomain);
    await deleteSegmentCustomAttribute(shopDomain, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete custom attribute.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
