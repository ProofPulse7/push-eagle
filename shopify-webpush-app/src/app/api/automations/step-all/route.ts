import { NextResponse } from 'next/server';
import { z } from 'zod';

import { env } from '@/lib/config/env';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';
import { getAutomationOverview, listDueAutomationJobs, processAutomationJob, upsertAutomationRule } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const bodySchema = z.object({
  shopDomain: z.string().min(1),
  maxJobs: z.number().int().min(1).max(2000).optional(),
  maxConcurrent: z.number().int().min(1).max(200).optional(),
  processJobs: z.boolean().optional(),
});

const defaultConfigs = {
  welcome_subscriber: {
    steps: {
      'reminder-1': { enabled: true, delayMinutes: 0 },
      'reminder-2': { enabled: true, delayMinutes: 0 },
      'reminder-3': { enabled: true, delayMinutes: 0 },
    },
  },
  browse_abandonment_15m: {
    steps: {
      'browse-reminder-1': { enabled: true, delayMinutes: 0 },
      'browse-reminder-2': { enabled: true, delayMinutes: 0 },
      'browse-reminder-3': { enabled: true, delayMinutes: 0 },
    },
  },
  cart_abandonment_30m: {
    steps: {
      'cart-reminder-1': { enabled: true, delayMinutes: 0 },
      'cart-reminder-2': { enabled: true, delayMinutes: 0 },
      'cart-reminder-3': { enabled: true, delayMinutes: 0 },
    },
  },
  shipping_notifications: { sendWhen: ['in_transit', 'out_for_delivery', 'delivered'] },
  back_in_stock: {},
  price_drop: {},
} as const;

type SupportedRuleKey = keyof typeof defaultConfigs;

const supportedRuleKeys = Object.keys(defaultConfigs) as SupportedRuleKey[];

const ensureAuthorized = (request: Request) => {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || request.headers.get('x-automation-secret') || '';
  if (env.CRON_SECRET) {
    return secret === env.CRON_SECRET;
  }

  const host = request.headers.get('host') || '';
  return /localhost|127\.0\.0\.1/i.test(host);
};

export async function POST(request: Request) {
  try {
    if (!ensureAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized automation step request.' }, { status: 401 });
    }

    const parsed = bodySchema.parse(await request.json());
    const shopDomain = parseShopDomain(parsed.shopDomain);
    const maxJobs = parsed.maxJobs ?? 200;
    const maxConcurrent = parsed.maxConcurrent ?? 50;
    const processJobs = parsed.processJobs ?? true;

    let firebaseReady = true;
    let firebaseError: string | null = null;
    try {
      getFirebaseAdminMessaging();
    } catch (error) {
      firebaseReady = false;
      firebaseError = error instanceof Error ? error.message : 'Failed to initialize Firebase Admin SDK.';
    }

    await Promise.all(
      Object.entries(defaultConfigs).map(([ruleKey, config]) =>
        upsertAutomationRule(shopDomain, ruleKey as keyof typeof defaultConfigs, true, config),
      ),
    );

    const jobs = await listDueAutomationJobs(maxJobs, 1, 0);
    const shopJobs = jobs.filter((job) => job.shop_domain === shopDomain);
    const dueByRule = supportedRuleKeys.reduce<Record<SupportedRuleKey, number>>((acc, ruleKey) => {
      acc[ruleKey] = shopJobs.filter((job) => String(job.rule_key) === ruleKey).length;
      return acc;
    }, {
      welcome_subscriber: 0,
      browse_abandonment_15m: 0,
      cart_abandonment_30m: 0,
      shipping_notifications: 0,
      back_in_stock: 0,
      price_drop: 0,
    });

    const processed = [] as Array<{ jobId: string; processed: boolean; error?: string }>;

    if (processJobs) {
      for (let index = 0; index < shopJobs.length; index += maxConcurrent) {
        const chunk = shopJobs.slice(index, index + maxConcurrent);
        const chunkResults = await Promise.all(
          chunk.map(async (job) => {
            const result = await processAutomationJob(job.id);
            return { jobId: job.id, processed: Boolean(result.processed), error: result.error };
          }),
        );

        processed.push(...chunkResults);
      }
    }

    const overview = await getAutomationOverview(shopDomain);

    return NextResponse.json({
      ok: true,
      firebaseReady,
      firebaseError,
      enabledRuleCount: Object.keys(defaultConfigs).length,
      processJobs,
      dueJobs: shopJobs.length,
      dueByRule,
      sentCount: processed.filter((item) => item.processed).length,
      failedCount: processed.filter((item) => !item.processed && item.error).length,
      processed,
      overview,
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? 'Missing or invalid shop domain.'
      : error instanceof Error
        ? error.message
        : 'Failed to step automations.';

    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}