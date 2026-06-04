'use client';

import { useEffect } from 'react';

import {
  useAttributionSettings,
  useBrandingSettings,
  useMerchantOverview,
} from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { useSettings } from '@/context/settings-context';
import { mergePendingSettings } from '@/lib/client/pending-settings';

/** Applies React Query cached merchant settings into SettingsContext (instant UI). */
export function SettingsCacheSync() {
  const shop = useShopDomain();
  const { data: overview } = useMerchantOverview();
  const { data: branding } = useBrandingSettings();
  const { data: attribution } = useAttributionSettings();
  const {
    setStoreUrl,
    setLogo,
    setShopDomain,
    storeUrl,
    setAttributionModel,
    setAttributionCreditMode,
    setClickWindowDays,
    setImpressionWindowDays,
  } = useSettings();

  useEffect(() => {
    if (shop) {
      setShopDomain(shop);
    }
  }, [shop, setShopDomain]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    const nextStoreUrl = String(overview.storeUrl ?? '').trim();
    if (nextStoreUrl) {
      setStoreUrl(nextStoreUrl);
      return;
    }

    if (!storeUrl && shop) {
      setStoreUrl(`https://${shop}`);
    }
  }, [overview, setStoreUrl, shop, storeUrl]);

  useEffect(() => {
    if (!branding) {
      return;
    }

    const logoUrl = String(branding.logoUrl ?? '').trim();
    if (logoUrl) {
      setLogo({ file: null, preview: logoUrl });
    }
  }, [branding, setLogo]);

  useEffect(() => {
    if (!shop || !attribution) {
      return;
    }

    const merged = mergePendingSettings(shop, 'attribution', attribution);
    const model = String(merged.attributionModel ?? '');
    if (model === 'click' || model === 'impression') {
      setAttributionModel(model);
    }

    const creditMode = String(merged.attributionCreditMode ?? '');
    if (creditMode === 'last_touch' || creditMode === 'all_touches') {
      setAttributionCreditMode(creditMode);
    }

    const clickDays = Number(merged.clickWindowDays);
    if (Number.isFinite(clickDays) && clickDays > 0) {
      setClickWindowDays(clickDays);
    }

    const impressionDays = Number(merged.impressionWindowDays);
    if (Number.isFinite(impressionDays) && impressionDays > 0) {
      setImpressionWindowDays(impressionDays);
    }
  }, [
    attribution,
    shop,
    setAttributionCreditMode,
    setAttributionModel,
    setClickWindowDays,
    setImpressionWindowDays,
  ]);

  return null;
}
