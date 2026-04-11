import { NextResponse } from 'next/server';

const ROOT_APP_URL = process.env.SHOPIFY_ROOT_APP_URL?.trim() || 'https://push-eagle.vercel.app';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const from = new URL(request.url);
  const target = new URL('/auth/callback', ROOT_APP_URL);
  from.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target, { status: 307 });
}
