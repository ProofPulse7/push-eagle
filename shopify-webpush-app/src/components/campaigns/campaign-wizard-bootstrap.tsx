'use client';

import { useEffect, useRef } from 'react';
import { useCampaignState } from '@/context/campaign-context';
import { useShopDomain } from '@/hooks/use-shop-domain';
import {
  loadWizardSession,
  mapCampaignRecordToWizardState,
  readWizardQueryParams,
} from '@/lib/client/campaign-wizard-bridge';

/** Loads draft/duplicate campaign data into the wizard context once per entry. */
export function CampaignWizardBootstrap() {
  const shopFromHook = useShopDomain();
  const shop = shopFromHook || readWizardQueryParams().shop;
  const { hydrateWizardState, wizardReady, setWizardReady } = useCampaignState();
  const bootstrappedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shop || wizardReady) {
      return;
    }

    const bootKey = `${shop}:${window.location.search}`;
    if (bootstrappedRef.current === bootKey) {
      return;
    }

    const { draftId, duplicateId } = readWizardQueryParams();
    const sourceId = draftId || duplicateId;

    const finishBootstrap = (state: Parameters<typeof hydrateWizardState>[0]) => {
      hydrateWizardState(state);
      bootstrappedRef.current = bootKey;
      setWizardReady(true);
    };

    if (!sourceId) {
      const saved = loadWizardSession(shop);
      if (saved) {
        finishBootstrap(saved);
        return;
      }
      setWizardReady(true);
      bootstrappedRef.current = bootKey;
      return;
    }

    let active = true;
    fetch(`/api/campaigns/${encodeURIComponent(sourceId)}?shop=${encodeURIComponent(shop)}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!active || !payload?.ok || !payload?.campaign) {
          if (active) {
            const saved = loadWizardSession(shop);
            if (saved) {
              finishBootstrap(saved);
            } else {
              setWizardReady(true);
              bootstrappedRef.current = bootKey;
            }
          }
          return;
        }

        finishBootstrap(
          mapCampaignRecordToWizardState(payload.campaign as Record<string, unknown>, {
            editingCampaignId: draftId ? sourceId : null,
          }),
        );
      })
      .catch(() => {
        if (!active) {
          return;
        }
        const saved = loadWizardSession(shop);
        if (saved) {
          finishBootstrap(saved);
        } else {
          setWizardReady(true);
          bootstrappedRef.current = bootKey;
        }
      });

    return () => {
      active = false;
    };
  }, [hydrateWizardState, setWizardReady, shop, wizardReady]);

  return null;
}
