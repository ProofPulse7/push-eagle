import { env } from '@/lib/config/env';
import { bumpCronWakeNow } from '@/lib/server/cron/cron-idle';
import { markCampaignSendFailed, sendCampaign } from '@/lib/server/data/store';

const DEFAULT_MAX_BATCHES = 50;
const MAX_LOOP_ITERATIONS = 200;

export type CampaignDeliveryJobResult = Awaited<ReturnType<typeof sendCampaign>> & {
  iterations: number;
  continuedAsync: boolean;
};

export const kickOffCampaignSendContinuation = (
  shopDomain: string,
  campaignId: string,
  maxBatches = DEFAULT_MAX_BATCHES,
) => {
  const baseUrl = String(env.NEXT_PUBLIC_APP_URL || env.SHOPIFY_APP_URL || '').replace(/\/$/, '');
  if (!baseUrl || !env.CRON_SECRET) {
    return { ok: false as const, reason: 'missing_app_url_or_cron_secret' };
  }

  void fetch(`${baseUrl}/api/campaigns/process-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-automation-secret': env.CRON_SECRET,
    },
    body: JSON.stringify({ shopDomain, campaignId, maxBatches }),
  }).catch((error) => {
    console.error('[campaign-send-queue] continuation kick-off failed', campaignId, error);
  });

  return { ok: true as const, triggered: true };
};

export const triggerCampaignSendContinuation = async (
  shopDomain: string,
  campaignId: string,
  maxBatches = DEFAULT_MAX_BATCHES,
) => {
  const baseUrl = String(env.NEXT_PUBLIC_APP_URL || env.SHOPIFY_APP_URL || '').replace(/\/$/, '');
  if (!baseUrl || !env.CRON_SECRET) {
    return { ok: false as const, reason: 'missing_app_url_or_cron_secret' };
  }

  try {
    const response = await fetch(`${baseUrl}/api/campaigns/process-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.CRON_SECRET}`,
        'x-automation-secret': env.CRON_SECRET,
      },
      body: JSON.stringify({ shopDomain, campaignId, maxBatches }),
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    console.error('[campaign-send-queue] continuation trigger failed', campaignId, error);
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : 'continuation_fetch_failed',
    };
  }
};

export const processCampaignDeliveryJob = async (
  shopDomain: string,
  campaignId: string,
  options?: { maxBatches?: number; maxIterations?: number },
): Promise<CampaignDeliveryJobResult> => {
  const maxBatches = Math.max(1, options?.maxBatches ?? DEFAULT_MAX_BATCHES);
  const maxIterations = Math.max(1, options?.maxIterations ?? MAX_LOOP_ITERATIONS);
  let iterations = 0;
  let lastResult: Awaited<ReturnType<typeof sendCampaign>> | null = null;

  try {
    while (iterations < maxIterations) {
      iterations += 1;
      lastResult = await sendCampaign(shopDomain, campaignId, { maxBatches });

      if (lastResult.completed) {
        return { ...lastResult, iterations, continuedAsync: false };
      }

      if ((lastResult.remainingRecipients ?? 0) <= 0) {
        return { ...lastResult, iterations, continuedAsync: false };
      }
    }

    await bumpCronWakeNow();
    kickOffCampaignSendContinuation(shopDomain, campaignId);

    return {
      ...(lastResult ?? {
        successCount: 0,
        failureCount: 0,
        recipientCount: 0,
        completed: false,
        remainingRecipients: 0,
      }),
      iterations,
      continuedAsync: true,
    };
  } catch (error) {
    console.error('[campaign-send-queue] delivery job failed', campaignId, error);
    await markCampaignSendFailed(shopDomain, campaignId);
    throw error;
  }
};

export const startCampaignDelivery = async (shopDomain: string, campaignId: string) => {
  await bumpCronWakeNow();
  const trigger = kickOffCampaignSendContinuation(shopDomain, campaignId);
  return {
    campaignId,
    shopDomain,
    trigger,
  };
};
