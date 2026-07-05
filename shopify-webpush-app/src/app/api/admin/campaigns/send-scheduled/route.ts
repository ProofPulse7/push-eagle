/**
 * Campaign Delivery Processor  
 * Handles scheduled campaign sending with smart delivery
 */

import { NextResponse } from 'next/server';
import { getCampaignsDueToSend, startCampaignDelivery, markCampaignSent } from '@/lib/server/automation/campaign-scheduler';
import { resolveCampaignAudience } from '@/lib/server/data/store';
import { getSubscribersByOptimalHour } from '@/lib/server/automation/smart-delivery';
import { insertCampaignDelivery } from '@/lib/server/integrations/deliveries-data';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/admin/campaigns/send-scheduled
 * Process scheduled campaigns due to send
 */
export async function GET(request: Request) {
  const secret = request.headers.get('X-Cron-Secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const campaigns = await getCampaignsDueToSend(10);

    if (campaigns.length === 0) {
      return NextResponse.json({
        ok: true,
        campaignsProcessed: 0,
        timestamp: new Date().toISOString(),
      });
    }

    let totalSent = 0;

    for (const campaign of campaigns) {
      try {
        await startCampaignDelivery(campaign.id, campaign.shop_domain);

        // Get audience tokens
        const tokens = await resolveCampaignAudience(campaign.shop_domain, campaign.segment_id);

        if (tokens.length === 0) {
          await markCampaignSent(campaign.id, campaign.shop_domain);
          continue;
        }

        // Send notifications
        const messaging = getFirebaseAdminMessaging();

        // Map fcm_token -> {subscriber_id, token_id} from the resolved audience so we
        // can record deliveries without re-reading subscriber_tokens from Neon (that
        // table is empty once the audience lives in D1 / d1_only mode).
        const idsByToken = new Map<string, { subscriberId: number; tokenId: number }>();
        for (const recipient of tokens) {
          const fcm = String((recipient as { fcm_token?: string | null }).fcm_token ?? '');
          if (!fcm) {
            continue;
          }
          idsByToken.set(fcm, {
            subscriberId: Number((recipient as { subscriber_id?: number }).subscriber_id ?? 0) || 0,
            tokenId: Number((recipient as { token_id?: number }).token_id ?? 0) || 0,
          });
        }

        // If smart send is enabled, batch by optimal hour
        let tokensByHour: Record<number, string[]> = {};
        if (campaign.smart_send_enabled) {
          tokensByHour = await getSubscribersByOptimalHour(campaign.shop_domain, campaign.id);
        } else {
          // Send to all immediately
          tokensByHour[new Date().getHours()] = tokens.map((t) => String(t.fcm_token));
        }

        // Send to each batch
        for (const [hour, tokenBatch] of Object.entries(tokensByHour)) {
          for (const token of tokenBatch) {
            try {
              await messaging.send({
                notification: {
                  title: campaign.title,
                  body: campaign.body,
                },
                webpush: {
                  fcmOptions: { link: campaign.target_url || '/' },
                  notification: {
                    title: campaign.title,
                    body: campaign.body,
                    icon: campaign.icon_url || undefined,
                    image: campaign.image_url || undefined,
                    tag: campaign.id,
                    requireInteraction: false,
                  },
                },
                token,
              });

              // Record delivery (async, don't wait). Ids come from the resolved
              // audience (D1-aware) so this works in both Neon and d1_only modes.
              const ids = idsByToken.get(token);
              void insertCampaignDelivery({
                campaignId: campaign.id,
                shopDomain: campaign.shop_domain,
                subscriberId: ids?.subscriberId ?? 0,
                tokenId: ids?.tokenId ?? 0,
                deliveredAt: new Date(),
              }).catch(() => undefined);

              totalSent++;
            } catch {
              // Silently skip failed sends to continue batch
            }
          }
        }

        // Mark campaign as sent after batch
        await markCampaignSent(campaign.id, campaign.shop_domain);
      } catch (error) {
        console.error(`Campaign ${campaign.id} processing failed:`, error);
        // Continue with next campaign
      }
    }

    return NextResponse.json({
      ok: true,
      campaignsProcessed: campaigns.length,
      notificationsSent: totalSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send campaigns';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
