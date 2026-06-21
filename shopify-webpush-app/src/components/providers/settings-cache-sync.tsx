'use client';

import { useEffect } from 'react';

import {
  useAttributionSettings,
  useBrandingSettings,
  useMerchantOverview,
} from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { useSettings } from '@/context/settings-context';
import { resolveMerchantWebsiteUrl } from '@/lib/client/merchant-website-url';
import {
  readCachedMerchantCurrency,
  writeCachedMerchantCurrency,
} from '@/lib/client/merchant-display-currency-cache';
import { setMerchantDisplayFormat } from '@/lib/merchant';
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
    if (!shop) {
      return;
    }

    const cachedCurrency = readCachedMerchantCurrency(shop);
    if (cachedCurrency) {
      setMerchantDisplayFormat(cachedCurrency);
    }
  }, [shop]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    const nextStoreUrl = resolveMerchantWebsiteUrl({
      storeUrl: String(overview.storeUrl ?? ''),
      primaryDomain: String(overview.primaryDomain ?? overview.primary_domain ?? ''),
    });

    if (nextStoreUrl) {
      setStoreUrl(nextStoreUrl);
    }

    const currencyCode = String(overview.currencyCode ?? '').trim();
    if (currencyCode) {
      setMerchantDisplayFormat(currencyCode);
      writeCachedMerchantCurrency(shop, currencyCode);
    }
  }, [overview, setStoreUrl, shop]);

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
