export type CampaignDisplayStatus =
  | 'Sent'
  | 'Scheduled'
  | 'Draft'
  | 'Archived'
  | 'Paused'
  | 'Sending';

const STATUS_MAP: Record<string, CampaignDisplayStatus> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  queued: 'Sending',
  sending: 'Sending',
  sent: 'Sent',
  archived: 'Archived',
  paused: 'Paused',
};

export type CampaignRowMetrics = {
  status: CampaignDisplayStatus;
  sendTime: string;
  impressions: number;
  deliveryCount: number;
  clickCount: number;
  revenueCents: number;
  clickRatePercent: number;
};

export const resolveCampaignRowMetrics = (campaign: Record<string, unknown>): CampaignRowMetrics => {
  const clickCount = Number(campaign.click_count ?? campaign.clickCount ?? 0);
  const deliveryCount = Number(campaign.delivery_count ?? campaign.deliveryCount ?? 0);
  const targetRecipientCount = Number(
    campaign.target_recipient_count ?? campaign.targetRecipientCount ?? 0,
  );

  let rawStatus = String(campaign.status ?? '').toLowerCase();
  const sentAtRaw = campaign.sent_at ?? campaign.sentAt;
  const scheduledAtRaw = campaign.scheduled_at ?? campaign.scheduledAt;
  const scheduledAt = scheduledAtRaw ? String(scheduledAtRaw) : null;
  const sentAt = sentAtRaw ? String(sentAtRaw) : null;

  const isInFlight =
    rawStatus !== 'sent'
    && rawStatus !== 'scheduled'
    && rawStatus !== 'archived'
    && rawStatus !== 'paused'
    && Boolean(sentAt || targetRecipientCount > 0)
    && (targetRecipientCount <= 0 || deliveryCount < targetRecipientCount);

  if (isInFlight && (rawStatus === 'draft' || rawStatus === 'queued' || rawStatus === 'sending')) {
    rawStatus = 'sending';
  } else if (
    rawStatus === 'draft'
    && targetRecipientCount > 0
    && deliveryCount >= targetRecipientCount
    && sentAt
  ) {
    rawStatus = 'sent';
  }

  const mappedStatus = STATUS_MAP[rawStatus] ?? 'Draft';
  const impressions =
    mappedStatus === 'Sending'
      ? Math.max(targetRecipientCount, deliveryCount, 0)
      : deliveryCount;
  const clickRatePercent =
    mappedStatus === 'Sent' && deliveryCount > 0 ? (clickCount / deliveryCount) * 100 : 0;

  return {
    status: mappedStatus,
    sendTime: String(
      mappedStatus === 'Scheduled' && scheduledAt
        ? scheduledAt
        : sentAt ?? scheduledAt ?? campaign.created_at ?? campaign.createdAt ?? new Date().toISOString(),
    ),
    impressions,
    deliveryCount,
    clickCount,
    revenueCents: Number(campaign.revenue_cents ?? campaign.revenueCents ?? 0),
    clickRatePercent,
  };
};

export const isCampaignActivelySending = (campaign: Record<string, unknown>) => {
  const metrics = resolveCampaignRowMetrics(campaign);
  if (metrics.status === 'Sending') {
    const deliveryCount = Number(campaign.delivery_count ?? campaign.deliveryCount ?? 0);
    const targetRecipientCount = Number(
      campaign.target_recipient_count ?? campaign.targetRecipientCount ?? 0,
    );
    return targetRecipientCount <= 0 || deliveryCount < targetRecipientCount;
  }

  return false;
};
