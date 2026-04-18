import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createSegment, listSegments } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const locationValueSchema = z.object({
  type: z.enum(['country', 'region', 'city']),
  value: z.string(),
  label: z.string().optional(),
});

const conditionSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['Clicked', 'Purchased', 'Purchased a product', 'Purchased from collection', 'Subscribed', 'Location', 'Customer tag']),
  operator: z.enum(['is', 'is not', 'has', 'has not']).optional(),
  countOperator: z.enum(['at least once', 'more than', 'less than', 'exactly']).optional(),
  countValue: z.number().optional(),
  dateOperator: z.enum(['at any time', 'before', 'after', 'less than', 'more than', 'between', 'in the last']).optional(),
  dateValue: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
  textValue: z.string().optional(),
  daysValue: z.number().optional(),
  selectedValues: z.array(locationValueSchema).optional(),
});

const conditionGroupSchema = z.object({
  id: z.string().optional(),
  conditions: z.array(conditionSchema).default([]),
});

const createSegmentSchema = z.object({
  shopDomain: z.string().optional(),
  name: z.string().min(1),
  conditionGroups: z.array(conditionGroupSchema).default([]),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const segments = await listSegments(shopDomain);
    return NextResponse.json({ ok: true, segments });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list segments.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = createSegmentSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);

    const segment = await createSegment({
      shopDomain,
      name: body.name,
      conditionGroups: body.conditionGroups,
    });

    return NextResponse.json({ ok: true, segment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create segment.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
