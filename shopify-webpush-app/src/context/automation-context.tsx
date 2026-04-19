'use client';
import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '@/context/settings-context';

type ActionButton = { title: string; link: string };
type ImageValue = { file: File | null; preview: string | null; originalPreview?: string | null };
type AutomationInitialState = {
    notification?: {
        title?: string;
        message?: string;
        targetUrl?: string | null;
        iconUrl?: string | null;
        heroUrl?: string | null;
        windowsHeroUrl?: string | null;
        macHeroUrl?: string | null;
        androidHeroUrl?: string | null;
        actionButtons?: ActionButton[];
    };
};

export interface AutomationContextType {
    isInitialized: boolean;
    title: string;
    setTitle: (title: string) => void;
    message: string;
    setMessage: (message: string) => void;
    primaryLink: string;
    setPrimaryLink: (link: string) => void;
    actionButtons: ActionButton[];
    setActionButtons: (buttons: ActionButton[]) => void;
    windowsHero: ImageValue;
    setWindowsHero: (image: ImageValue) => void;
    macHero: ImageValue;
    setMacHero: (image: ImageValue) => void;
    androidHero: ImageValue;
    setAndroidHero: (image: ImageValue) => void;
    logo: ImageValue;
    setLogo: (image: ImageValue) => void;
    initializeState: (initialState: AutomationInitialState) => void;
}

export const AutomationContext = createContext<AutomationContextType | undefined>(undefined);

export function useAutomationState() {
    const context = useContext(AutomationContext);
    if (!context) {
        throw new Error('useAutomationState must be used within an AutomationStateProvider');
    }
    return context;
}

export function AutomationStateProvider({ children }: { children: ReactNode }) {
    const blobUrlsRef = useRef<Set<string>>(new Set());
    const [isInitialized, setIsInitialized] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [primaryLink, setPrimaryLink] = useState('');
    const [actionButtons, setActionButtons] = useState<ActionButton[]>([]);
    const [windowsHero, setWindowsHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const [macHero, setMacHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const [androidHero, setAndroidHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const { storeUrl, shopDomain, logo, setLogo } = useSettings();

    const fallbackStoreUrl = storeUrl || (shopDomain ? `https://${shopDomain}` : '');

    const initializeState = useCallback((initialState: AutomationInitialState) => {
        if (initialState?.notification) {
            setTitle(initialState.notification.title || '');
            setMessage(initialState.notification.message || '');
            setPrimaryLink(initialState.notification.targetUrl || fallbackStoreUrl);
            if (!logo.preview) {
                setLogo({ file: null, preview: initialState.notification.iconUrl || null });
            }
            const fallbackHeroUrl = initialState.notification.heroUrl || null;
            const windowsHeroUrl = initialState.notification.windowsHeroUrl || fallbackHeroUrl;
            const macHeroUrl = initialState.notification.macHeroUrl || fallbackHeroUrl;
            const androidHeroUrl = initialState.notification.androidHeroUrl || fallbackHeroUrl;
            setWindowsHero({ file: null, preview: windowsHeroUrl, originalPreview: windowsHeroUrl });
            setMacHero({ file: null, preview: macHeroUrl, originalPreview: macHeroUrl });
            setAndroidHero({ file: null, preview: androidHeroUrl, originalPreview: androidHeroUrl });
            setActionButtons(initialState.notification.actionButtons || []);
            setIsInitialized(true);
        }
    }, [logo.preview, setLogo, fallbackStoreUrl]);

    const value: AutomationContextType = {
        isInitialized,
        title, setTitle,
        message, setMessage,
        primaryLink, setPrimaryLink,
        actionButtons, setActionButtons,
        windowsHero, setWindowsHero,
        macHero, setMacHero,
        androidHero, setAndroidHero,
        logo, setLogo,
        initializeState,
    };

    useEffect(() => {
        const candidates = [
            windowsHero.preview,
            windowsHero.originalPreview,
            macHero.preview,
            macHero.originalPreview,
            androidHero.preview,
            androidHero.originalPreview,
            logo.preview,
        ];

        candidates.forEach((url) => {
            if (url && url.startsWith('blob:')) {
                blobUrlsRef.current.add(url);
            }
        });
    }, [windowsHero.preview, windowsHero.originalPreview, macHero.preview, macHero.originalPreview, androidHero.preview, androidHero.originalPreview, logo.preview]);

    useEffect(() => {
        return () => {
            blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
            blobUrlsRef.current.clear();
        };
    }, []);

    return (
        <AutomationContext.Provider value={value}>
            {children}
        </AutomationContext.Provider>
    );
}
