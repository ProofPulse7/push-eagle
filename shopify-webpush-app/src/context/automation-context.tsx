'use client';
import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';
import { useSettings } from '@/context/settings-context';

type ActionButton = { title: string; link: string };
type ImageValue = { file: File | null; preview: string | null };
type AutomationInitialState = {
    notification?: {
        title?: string;
        message?: string;
        iconUrl?: string | null;
        heroUrl?: string | null;
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
    const [isInitialized, setIsInitialized] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [primaryLink, setPrimaryLink] = useState('https://example.com');
    const [actionButtons, setActionButtons] = useState<ActionButton[]>([]);
    const [windowsHero, setWindowsHero] = useState<ImageValue>({ file: null, preview: null });
    const [macHero, setMacHero] = useState<ImageValue>({ file: null, preview: null });
    const [androidHero, setAndroidHero] = useState<ImageValue>({ file: null, preview: null });
    const { logo, setLogo } = useSettings();

    const initializeState = useCallback((initialState: AutomationInitialState) => {
        if (initialState?.notification) {
            setTitle(initialState.notification.title || '');
            setMessage(initialState.notification.message || '');
            if (!logo.preview) {
                setLogo({ file: null, preview: initialState.notification.iconUrl || null });
            }
            const heroUrl = initialState.notification.heroUrl || null;
            setWindowsHero({ file: null, preview: heroUrl });
            setMacHero({ file: null, preview: heroUrl });
            setAndroidHero({ file: null, preview: heroUrl });
            setActionButtons(initialState.notification.actionButtons || []);
            setIsInitialized(true);
        }
    }, [logo.preview, setLogo]);

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
        const allPreviews = [windowsHero.preview, macHero.preview, androidHero.preview, logo.preview];
        return () => {
            allPreviews.forEach(p => {
                if (p && p.startsWith('blob:')) URL.revokeObjectURL(p);
            });
        };
    }, [windowsHero.preview, macHero.preview, androidHero.preview, logo.preview]);

    return (
        <AutomationContext.Provider value={value}>
            {children}
        </AutomationContext.Provider>
    );
}
