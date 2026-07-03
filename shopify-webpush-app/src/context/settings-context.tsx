'use client';

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

import { readShopDomainSync } from '@/lib/client/read-shop-domain';

type ImageValue = { file: File | null; preview: string | null };

interface SettingsContextType {
  storeUrl: string;
  setStoreUrl: (url: string) => void;
  shopDomain: string;
  setShopDomain: (value: string) => void;
  logo: ImageValue;
  setLogo: (logo: ImageValue) => void;
  attributionModel: 'click' | 'impression';
  setAttributionModel: (value: 'click' | 'impression') => void;
  attributionCreditMode: 'last_touch' | 'all_touches';
  setAttributionCreditMode: (value: 'last_touch' | 'all_touches') => void;
  clickWindowDays: number;
  setClickWindowDays: (value: number) => void;
  impressionWindowDays: number;
  setImpressionWindowDays: (value: number) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const shopStorageKey = (shop: string, name: string) => `pe:${shop}:${name}`;

const readStored = (shop: string, name: string) => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (shop) {
    const scoped = localStorage.getItem(shopStorageKey(shop, name));
    if (scoped != null) {
      return scoped;
    }
  }

  return localStorage.getItem(name);
};

const writeStored = (shop: string, name: string, value: string) => {
  if (shop) {
    localStorage.setItem(shopStorageKey(shop, name), value);
  }
  localStorage.setItem(name, value);
};

const removeStored = (shop: string, name: string) => {
  if (shop) {
    localStorage.removeItem(shopStorageKey(shop, name));
  }
  localStorage.removeItem(name);
};

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [storeUrl, setStoreUrlState] = useState('');
  const [shopDomain, setShopDomainState] = useState('');
  const [logo, setLogoState] = useState<ImageValue>({ file: null, preview: null });
  const [attributionModel, setAttributionModelState] = useState<'click' | 'impression'>('impression');
  const [attributionCreditMode, setAttributionCreditModeState] = useState<'last_touch' | 'all_touches'>(
    'last_touch',
  );
  const [clickWindowDays, setClickWindowDaysState] = useState(7);
  const [impressionWindowDays, setImpressionWindowDaysState] = useState(7);

  useEffect(() => {
    const resolvedShop = readShopDomainSync();
    if (!resolvedShop.endsWith('.myshopify.com')) {
      return;
    }

    setShopDomainState(resolvedShop);
    writeStored(resolvedShop, 'shopDomain', resolvedShop);

    const savedUrl = readStored(resolvedShop, 'storeUrl');
    if (savedUrl) {
      setStoreUrlState(savedUrl);
    }

    const savedLogo = readStored(resolvedShop, 'brandLogo');
    if (savedLogo) {
      setLogoState({ file: null, preview: savedLogo });
    }

    const savedAttributionModel = readStored(resolvedShop, 'attributionModel');
    if (savedAttributionModel === 'click' || savedAttributionModel === 'impression') {
      setAttributionModelState(savedAttributionModel);
    }

    const savedAttributionCreditMode = readStored(resolvedShop, 'attributionCreditMode');
    if (savedAttributionCreditMode === 'last_touch' || savedAttributionCreditMode === 'all_touches') {
      setAttributionCreditModeState(savedAttributionCreditMode);
    }

    const savedClickWindowDays = Number(readStored(resolvedShop, 'clickWindowDays'));
    if (Number.isFinite(savedClickWindowDays) && savedClickWindowDays > 0) {
      setClickWindowDaysState(savedClickWindowDays);
    }

    const savedImpressionWindowDays = Number(readStored(resolvedShop, 'impressionWindowDays'));
    if (Number.isFinite(savedImpressionWindowDays) && savedImpressionWindowDays > 0) {
      setImpressionWindowDaysState(savedImpressionWindowDays);
    }
  }, []);

  const setStoreUrl = useCallback((url: string) => {
    setStoreUrlState((current) => {
      if (current === url) {
        return current;
      }
      const shop = readShopDomainSync();
      writeStored(shop, 'storeUrl', url);
      return url;
    });
  }, []);

  const setShopDomain = useCallback((value: string) => {
    const normalized = value.trim().toLowerCase();
    setShopDomainState((current) => {
      if (current === normalized) {
        return current;
      }
      writeStored(normalized, 'shopDomain', normalized);
      return normalized;
    });
  }, []);

  const setLogo = useCallback((logoValue: ImageValue) => {
    setLogoState((current) => {
      if (current.preview === logoValue.preview && current.file === logoValue.file) {
        return current;
      }

      const shop = readShopDomainSync();
      if (logoValue.preview && !logoValue.preview.startsWith('blob:')) {
        writeStored(shop, 'brandLogo', logoValue.preview);
      } else {
        removeStored(shop, 'brandLogo');
      }

      return logoValue;
    });
  }, []);

  const setAttributionModel = useCallback((value: 'click' | 'impression') => {
    setAttributionModelState((current) => {
      if (current === value) {
        return current;
      }
      const shop = readShopDomainSync();
      writeStored(shop, 'attributionModel', value);
      return value;
    });
  }, []);

  const setAttributionCreditMode = useCallback((value: 'last_touch' | 'all_touches') => {
    setAttributionCreditModeState((current) => {
      if (current === value) {
        return current;
      }
      const shop = readShopDomainSync();
      writeStored(shop, 'attributionCreditMode', value);
      return value;
    });
  }, []);

  const setClickWindowDays = useCallback((value: number) => {
    setClickWindowDaysState((current) => {
      if (current === value) {
        return current;
      }
      const shop = readShopDomainSync();
      writeStored(shop, 'clickWindowDays', String(value));
      return value;
    });
  }, []);

  const setImpressionWindowDays = useCallback((value: number) => {
    setImpressionWindowDaysState((current) => {
      if (current === value) {
        return current;
      }
      const shop = readShopDomainSync();
      writeStored(shop, 'impressionWindowDays', String(value));
      return value;
    });
  }, []);

  const value = useMemo(
    () => ({
      storeUrl,
      setStoreUrl,
      shopDomain,
      setShopDomain,
      logo,
      setLogo,
      attributionModel,
      setAttributionModel,
      attributionCreditMode,
      setAttributionCreditMode,
      clickWindowDays,
      setClickWindowDays,
      impressionWindowDays,
      setImpressionWindowDays,
    }),
    [
      storeUrl,
      setStoreUrl,
      shopDomain,
      setShopDomain,
      logo,
      setLogo,
      attributionModel,
      setAttributionModel,
      attributionCreditMode,
      setAttributionCreditMode,
      clickWindowDays,
      setClickWindowDays,
      impressionWindowDays,
      setImpressionWindowDays,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
