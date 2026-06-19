import { requeueCampaignForDelivery, sendCampaign } from '@/lib/server/data/store';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const UNRECOVERABLE_ERRORS = [
  'No active browser notification tokens',
  'already been sent',
  'Campaign not found',
  'Flash sale has expired',
  "cannot be sent from status",
];

const isUnrecoverableDeliveryError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return UNRECOVERABLE_ERRORS.some((fragment) => message.includes(fragment));
};

export type DeliverCampaignResult = {
  successCount: number;
  failureCount: number;
  recipientCount: number;
  completed: boolean;
  remainingRecipients: number;
};

export const deliverCampaignUntilComplete = async (
  shopDomain: string,
  campaignId: string,
  options?: { maxBatches?: number; maxRounds?: number },
): Promise<DeliverCampaignResult> => {
  const maxBatches = options?.maxBatches ?? 2000;
  const maxRounds = Math.max(1, Math.min(options?.maxRounds ?? 40, 200));

  let lastResult: DeliverCampaignResult = {
    successCount: 0,
    failureCount: 0,
    recipientCount: 0,
    completed: false,
    remainingRecipients: 0,
  };

  for (let round = 1; round <= maxRounds; round += 1) {
    try {
      const result = await sendCampaign(shopDomain, campaignId, { maxBatches });
      lastResult = {
        successCount: Number(result.successCount ?? 0),
        failureCount: Number(result.failureCount ?? 0),
        recipientCount: Number(result.recipientCount ?? 0),
        completed: Boolean(result.completed),
        remainingRecipients: Number(result.remainingRecipients ?? 0),
      };

      if (lastResult.completed) {
        return lastResult;
      }

      if (round < maxRounds) {
        await sleep(round <= 2 ? 0 : 200);
      }
    } catch (error) {
      if (isUnrecoverableDeliveryError(error)) {
        throw error;
      }

      await requeueCampaignForDelivery(shopDomain, campaignId);
      await sleep(Math.min(400 * round, 3000));
    }
  }

  await requeueCampaignForDelivery(shopDomain, campaignId);
  return lastResult;
};
