'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  CAMPAIGN_LAUNCH_FAILURE_EVENT,
  clearCampaignLaunchFailure,
  readCampaignLaunchFailure,
  resumePendingCampaignLaunches,
} from '@/lib/client/campaign-background-launch';
import { useToast } from '@/hooks/use-toast';
import { useShopDomain } from '@/hooks/use-shop-domain';

/** Resumes interrupted campaign launches and surfaces failures after long idle sessions. */
export function CampaignLaunchRecovery() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!shop) {
      return;
    }

    resumePendingCampaignLaunches(queryClient, shop);

    const storedFailure = readCampaignLaunchFailure(shop);
    if (storedFailure) {
      toast({
        variant: 'destructive',
        title: 'Campaign launch failed',
        description: storedFailure,
      });
      clearCampaignLaunchFailure(shop);
    }

    const onLaunchFailure = (event: Event) => {
      const detail = (event as CustomEvent<{ shop?: string; message?: string }>).detail;
      if (detail?.shop !== shop || !detail.message) {
        return;
      }

      toast({
        variant: 'destructive',
        title: 'Campaign launch failed',
        description: detail.message,
      });
      clearCampaignLaunchFailure(shop);
    };

    const onFocus = () => {
      resumePendingCampaignLaunches(queryClient, shop);
    };

    window.addEventListener(CAMPAIGN_LAUNCH_FAILURE_EVENT, onLaunchFailure);
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener(CAMPAIGN_LAUNCH_FAILURE_EVENT, onLaunchFailure);
      window.removeEventListener('focus', onFocus);
    };
  }, [queryClient, shop, toast]);

  return null;
}
