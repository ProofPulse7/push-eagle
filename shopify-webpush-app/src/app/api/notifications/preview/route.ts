import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sendWebPushToToken } from '@/lib/integrations/firebase/admin';

export const runtime = 'nodejs';

const payloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  icon: z.string().url().optional().nullable(),
  image: z.string().url().optional().nullable(),
  url: z.string().url().optional().nullable(),
});

const requestSchema = z.object({
  token: z.string().min(10),
  payload: payloadSchema,
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const messageId = await sendWebPushToToken(body.token, body.payload);
    return NextResponse.json({ ok: true, messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send preview notification.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
