import { NextResponse } from 'next/server';
import { z } from 'zod';

import { estimateSegmentAudience } from '@/lib/server/data/store';
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

const estimateSchema = z.object({
  shopDomain: z.string().optional(),
  conditionGroups: z.array(conditionGroupSchema).default([]),
});

export async function POST(request: Request) {
  try {
    const body = estimateSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const estimatedCount = await estimateSegmentAudience(shopDomain, body.conditionGroups);
    return NextResponse.json({ ok: true, estimatedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to estimate segment audience.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
