
'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

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
    clickWindowDays: number;
    setClickWindowDays: (value: number) => void;
    impressionWindowDays: number;
    setImpressionWindowDays: (value: number) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

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
    const [clickWindowDays, setClickWindowDaysState] = useState(2);
    const [impressionWindowDays, setImpressionWindowDaysState] = useState(3);

    useEffect(() => {
        // Load settings from localStorage when the component mounts on the client
        const queryShop = new URLSearchParams(window.location.search).get('shop');
        const cookieShop = document.cookie
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith('pe_shop='))
            ?.slice('pe_shop='.length);
        const resolvedShop = (queryShop || cookieShop || '').trim().toLowerCase();
        if (resolvedShop.endsWith('.myshopify.com')) {
            setShopDomainState(resolvedShop);
            localStorage.setItem('shopDomain', resolvedShop);
        }

        const savedUrl = localStorage.getItem('storeUrl');
        if (savedUrl) {
            setStoreUrlState(savedUrl);
        }
        const savedShopDomain = localStorage.getItem('shopDomain');
        if (savedShopDomain) {
            setShopDomainState(savedShopDomain);
        }
        const savedLogo = localStorage.getItem('brandLogo');
        if (savedLogo) {
            setLogoState({ file: null, preview: savedLogo });
        }
        const savedAttributionModel = localStorage.getItem('attributionModel');
        if (savedAttributionModel === 'click' || savedAttributionModel === 'impression') {
            setAttributionModelState(savedAttributionModel);
        }
        const savedClickWindowDays = Number(localStorage.getItem('clickWindowDays'));
        if (Number.isFinite(savedClickWindowDays) && savedClickWindowDays > 0) {
            setClickWindowDaysState(savedClickWindowDays);
        }
        const savedImpressionWindowDays = Number(localStorage.getItem('impressionWindowDays'));
        if (Number.isFinite(savedImpressionWindowDays) && savedImpressionWindowDays > 0) {
            setImpressionWindowDaysState(savedImpressionWindowDays);
        }
    }, []);

    useEffect(() => {
        const activeShop = shopDomain.trim().toLowerCase();
        if (!activeShop) {
            return;
        }

        let isMounted = true;

        fetch(`/api/settings/overview?shop=${encodeURIComponent(activeShop)}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok || !data?.ok || !isMounted) {
                    return;
                }

                const nextStoreUrl = String(data.storeUrl ?? '').trim();
                if (nextStoreUrl && nextStoreUrl !== storeUrl) {
                    setStoreUrlState(nextStoreUrl);
                    localStorage.setItem('storeUrl', nextStoreUrl);
                } else if (!nextStoreUrl && !storeUrl) {
                    const fallbackStoreUrl = `https://${activeShop}`;
                    setStoreUrlState(fallbackStoreUrl);
                    localStorage.setItem('storeUrl', fallbackStoreUrl);
                }
            })
            .catch(() => undefined);

        fetch(`/api/settings/branding?shop=${encodeURIComponent(activeShop)}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok || !data?.ok || !isMounted) {
                    return;
                }

                const nextLogoUrl = String(data.logoUrl ?? '').trim();
                if (nextLogoUrl && nextLogoUrl !== logo.preview) {
                    setLogoState({ file: null, preview: nextLogoUrl });
                    localStorage.setItem('brandLogo', nextLogoUrl);
                }
            })
            .catch(() => undefined);

        return () => {
            isMounted = false;
        };
    }, [shopDomain, storeUrl, logo.preview]);

    const setStoreUrl = (url: string) => {
        setStoreUrlState(url);
        localStorage.setItem('storeUrl', url);
    };

    const setShopDomain = (value: string) => {
        setShopDomainState(value);
        localStorage.setItem('shopDomain', value);
    };

    const setLogo = (logoValue: ImageValue) => {
        setLogoState(logoValue);
        if (logoValue.preview) {
             // Only save if it's a base64 string or a non-blob URL
            if (!logoValue.preview.startsWith('blob:')) {
                localStorage.setItem('brandLogo', logoValue.preview);
            }
        } else {
            localStorage.removeItem('brandLogo');
        }
    };

    const setAttributionModel = (value: 'click' | 'impression') => {
        setAttributionModelState(value);
        localStorage.setItem('attributionModel', value);
    };

    const setClickWindowDays = (value: number) => {
        setClickWindowDaysState(value);
        localStorage.setItem('clickWindowDays', String(value));
    };

    const setImpressionWindowDays = (value: number) => {
        setImpressionWindowDaysState(value);
        localStorage.setItem('impressionWindowDays', String(value));
    };

    const value = {
        storeUrl,
        setStoreUrl,
        shopDomain,
        setShopDomain,
        logo,
        setLogo,
        attributionModel,
        setAttributionModel,
        clickWindowDays,
        setClickWindowDays,
        impressionWindowDays,
        setImpressionWindowDays,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}
