'use client';

import { useEffect, useState } from 'react';

import { useSettings } from '@/context/settings-context';

const readShopFromBrowser = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const queryShop = new URLSearchParams(window.location.search).get('shop');
  if (queryShop?.trim()) {
    return queryShop.trim().toLowerCase();
  }

  const cookieShop = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('pe_shop='))
    ?.slice('pe_shop='.length);

  if (cookieShop?.trim()) {
    return cookieShop.trim().toLowerCase();
  }

  const stored = localStorage.getItem('shopDomain');
  return stored?.trim().toLowerCase() ?? '';
};

export function useShopDomain() {
  const { shopDomain: contextShop, setShopDomain } = useSettings();
  const [queryShop, setQueryShop] = useState('');

  useEffect(() => {
    const resolved = readShopFromBrowser();
    setQueryShop(resolved);
    if (resolved && resolved !== contextShop) {
      setShopDomain(resolved);
    }
  }, [contextShop, setShopDomain]);

  return (queryShop || contextShop || '').trim().toLowerCase();
}
