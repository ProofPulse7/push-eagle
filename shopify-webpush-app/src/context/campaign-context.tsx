'use client';
import { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback } from 'react';
import { useSettings } from '@/context/settings-context';
import { isMyshopifyHost, normalizeMerchantWebsiteUrl, resolveMerchantWebsiteUrl } from '@/lib/client/merchant-website-url';
import {
  clearWizardSession,
  loadWizardSession,
  saveWizardSession,
  type SerializableWizardState,
} from '@/lib/client/campaign-wizard-bridge';

type ActionButton = { title: string; link: string };
type ImageValue = { file: File | null; preview: string | null; originalPreview?: string | null };

export interface CampaignContextType {
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
    sendingOption: string;
    setSendingOption: (option: string) => void;
    scheduledDate: Date | undefined;
    setScheduledDate: (value: Date | undefined) => void;
    scheduledTime: string;
    setScheduledTime: (value: string) => void;
    segmentId: string;
    setSegmentId: (value: string) => void;
    smartDeliver: boolean;
    setSmartDeliver: (enabled: boolean) => void;
    flashSaleEnabled: boolean;
    setFlashSaleEnabled: (enabled: boolean) => void;
    flashSaleDiscountPercent: number;
    setFlashSaleDiscountPercent: (percent: number) => void;
    flashSaleOriginalPrice: number;
    setFlashSaleOriginalPrice: (price: number) => void;
    flashSaleSalePrice: number;
    setFlashSaleSalePrice: (price: number) => void;
    flashSaleExpiresAt: Date | undefined;
    setFlashSaleExpiresAt: (date: Date | undefined) => void;
    flashSaleUrgencyText: string;
    setFlashSaleUrgencyText: (text: string) => void;
    recurringPattern: string;
    setRecurringPattern: (pattern: string) => void;
    editingCampaignId: string | null;
    setEditingCampaignId: (value: string | null) => void;
    wizardReady: boolean;
    setWizardReady: (value: boolean) => void;
    hydrateWizardState: (state: SerializableWizardState) => void;
    resetWizard: () => void;
    serializeWizardState: () => SerializableWizardState;
}

export const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

const normalizeTrackedLink = (value: string | null | undefined) => {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return '';
    }

    try {
        const parsed = new URL(raw);
        if (parsed.pathname === '/api/track/click' || parsed.pathname === '/api/track/automation-click') {
            return parsed.searchParams.get('u') || raw;
        }
    } catch {
        return raw;
    }

    return raw;
};

const toImageValue = (preview: string | null | undefined): ImageValue => ({
    file: null,
    preview: preview ?? null,
    originalPreview: preview ?? null,
});

export function useCampaignState() {
    const context = useContext(CampaignContext);
    if (!context) {
        throw new Error('useCampaignState must be used within NewCampaignLayout');
    }
    return context;
}

export function CampaignStateProvider({ children }: { children: ReactNode }) {
    const blobUrlsRef = useRef<Set<string>>(new Set());
    const skipPrimaryLinkAutofillRef = useRef(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [primaryLink, setPrimaryLink] = useState('');
    const [actionButtons, setActionButtons] = useState<ActionButton[]>([]);
    const [windowsHero, setWindowsHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const [macHero, setMacHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const [androidHero, setAndroidHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const { storeUrl, shopDomain, logo, setLogo } = useSettings();
    const [sendingOption, setSendingOption] = useState('now');
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
    const [scheduledTime, setScheduledTime] = useState('10:00 AM');
    const [segmentId, setSegmentId] = useState('all');
    const [smartDeliver, setSmartDeliver] = useState(false);
    const [flashSaleEnabled, setFlashSaleEnabled] = useState(false);
    const [flashSaleDiscountPercent, setFlashSaleDiscountPercent] = useState(20);
    const [flashSaleOriginalPrice, setFlashSaleOriginalPrice] = useState(0);
    const [flashSaleSalePrice, setFlashSaleSalePrice] = useState(0);
    const [flashSaleExpiresAt, setFlashSaleExpiresAt] = useState<Date | undefined>(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const [flashSaleUrgencyText, setFlashSaleUrgencyText] = useState('⏰ Limited time offer!');
    const [recurringPattern, setRecurringPattern] = useState('');
    const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
    const [wizardReady, setWizardReady] = useState(false);

    const serializeWizardState = useCallback((): SerializableWizardState => ({
        title,
        message,
        primaryLink,
        actionButtons,
        windowsHeroPreview: windowsHero.preview,
        macHeroPreview: macHero.preview,
        androidHeroPreview: androidHero.preview,
        logoPreview: logo.preview,
        sendingOption,
        scheduledDateIso: scheduledDate ? scheduledDate.toISOString() : null,
        scheduledTime,
        segmentId,
        smartDeliver,
        flashSaleEnabled,
        editingCampaignId,
    }), [
        actionButtons,
        androidHero.preview,
        editingCampaignId,
        flashSaleEnabled,
        logo.preview,
        macHero.preview,
        message,
        primaryLink,
        scheduledDate,
        scheduledTime,
        segmentId,
        sendingOption,
        smartDeliver,
        title,
        windowsHero.preview,
    ]);

    const hydrateWizardState = useCallback((state: SerializableWizardState) => {
        skipPrimaryLinkAutofillRef.current = Boolean(state.primaryLink?.trim());
        setTitle(state.title ?? '');
        setMessage(state.message ?? '');
        setPrimaryLink(state.primaryLink ?? '');
        setActionButtons(Array.isArray(state.actionButtons) ? state.actionButtons : []);
        setWindowsHero(toImageValue(state.windowsHeroPreview));
        setMacHero(toImageValue(state.macHeroPreview));
        setAndroidHero(toImageValue(state.androidHeroPreview));
        setLogo(toImageValue(state.logoPreview));
        setSendingOption(state.sendingOption ?? 'now');
        setScheduledDate(state.scheduledDateIso ? new Date(state.scheduledDateIso) : new Date());
        setScheduledTime(state.scheduledTime ?? '10:00 AM');
        setSegmentId(state.segmentId ?? 'all');
        setSmartDeliver(Boolean(state.smartDeliver));
        setFlashSaleEnabled(Boolean(state.flashSaleEnabled));
        setEditingCampaignId(state.editingCampaignId ?? null);
    }, [setLogo]);

    const resetWizard = useCallback(() => {
        skipPrimaryLinkAutofillRef.current = false;
        setTitle('');
        setMessage('');
        setPrimaryLink('');
        setActionButtons([]);
        setWindowsHero({ file: null, preview: null, originalPreview: null });
        setMacHero({ file: null, preview: null, originalPreview: null });
        setAndroidHero({ file: null, preview: null, originalPreview: null });
        setLogo({ file: null, preview: null });
        setSendingOption('now');
        setScheduledDate(new Date());
        setScheduledTime('10:00 AM');
        setSegmentId('all');
        setSmartDeliver(false);
        setFlashSaleEnabled(false);
        setEditingCampaignId(null);
        if (shopDomain) {
            clearWizardSession(shopDomain);
        }
    }, [setLogo, shopDomain]);

    useEffect(() => {
        if (skipPrimaryLinkAutofillRef.current) {
            const normalizedLink = normalizeTrackedLink(primaryLink);
            if (normalizedLink !== primaryLink) {
                setPrimaryLink(normalizedLink);
            }
            return;
        }

        const merchantWebsiteUrl = resolveMerchantWebsiteUrl({ storeUrl });
        const normalizedLink = normalizeTrackedLink(primaryLink);
        if (normalizedLink !== primaryLink) {
            setPrimaryLink(normalizedLink);
            return;
        }

        if (!merchantWebsiteUrl) {
            return;
        }

        if (!primaryLink || isMyshopifyHost(primaryLink)) {
            setPrimaryLink(merchantWebsiteUrl);
            return;
        }

        const normalizedPrimary = normalizeMerchantWebsiteUrl(primaryLink);
        if (normalizedPrimary && isMyshopifyHost(normalizedPrimary)) {
            setPrimaryLink(merchantWebsiteUrl);
        }
    }, [primaryLink, storeUrl]);

    useEffect(() => {
        if (!shopDomain || !wizardReady) {
            return;
        }

        const timer = window.setTimeout(() => {
            saveWizardSession(shopDomain, serializeWizardState());
        }, 250);

        return () => window.clearTimeout(timer);
    }, [serializeWizardState, shopDomain, wizardReady]);

    useEffect(() => {
        if (!shopDomain || wizardReady) {
            return;
        }

        const saved = loadWizardSession(shopDomain);
        if (saved) {
            hydrateWizardState(saved);
        }
    }, [hydrateWizardState, shopDomain, wizardReady]);

    const value: CampaignContextType = {
        title, setTitle,
        message, setMessage,
        primaryLink, setPrimaryLink,
        actionButtons, setActionButtons,
        windowsHero, setWindowsHero,
        macHero, setMacHero,
        androidHero, setAndroidHero,
        logo, setLogo,
        sendingOption, setSendingOption,
        scheduledDate, setScheduledDate,
        scheduledTime, setScheduledTime,
        segmentId, setSegmentId,
        smartDeliver, setSmartDeliver,
        flashSaleEnabled, setFlashSaleEnabled,
        flashSaleDiscountPercent, setFlashSaleDiscountPercent,
        flashSaleOriginalPrice, setFlashSaleOriginalPrice,
        flashSaleSalePrice, setFlashSaleSalePrice,
        flashSaleExpiresAt, setFlashSaleExpiresAt,
        flashSaleUrgencyText, setFlashSaleUrgencyText,
        recurringPattern, setRecurringPattern,
        editingCampaignId, setEditingCampaignId,
        wizardReady, setWizardReady,
        hydrateWizardState,
        resetWizard,
        serializeWizardState,
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
    }, [
        windowsHero.preview,
        windowsHero.originalPreview,
        macHero.preview,
        macHero.originalPreview,
        androidHero.preview,
        androidHero.originalPreview,
        logo.preview,
    ]);

    useEffect(() => {
        return () => {
            blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
            blobUrlsRef.current.clear();
        };
    }, []);

    return (
        <CampaignContext.Provider value={value}>
            {children}
        </CampaignContext.Provider>
    );
}
