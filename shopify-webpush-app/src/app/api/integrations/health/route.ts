import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';

export async function GET() {
  return NextResponse.json({
    ok: true,
    services: {
      shopify: Boolean(env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET),
      neon: Boolean(env.NEON_DATABASE_URL),
      supabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
      firebaseClient: Boolean(env.NEXT_PUBLIC_FIREBASE_API_KEY && env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    },
  });
}
