'use client';
import { createContext, useState, useContext, ReactNode, useEffect, useRef } from 'react';
import { useSettings } from '@/context/settings-context';

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
    // Smart Delivery
    smartDeliver: boolean;
    setSmartDeliver: (enabled: boolean) => void;
    // Flash Sale
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
    // Recurring campaigns
    recurringPattern: string;
    setRecurringPattern: (pattern: string) => void;
}

export const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export function useCampaignState() {
    const context = useContext(CampaignContext);
    if (!context) {
        throw new Error('useCampaignState must be used within NewCampaignLayout');
    }
    return context;
}

export function CampaignStateProvider({ children }: { children: ReactNode }) {
    const blobUrlsRef = useRef<Set<string>>(new Set());
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [primaryLink, setPrimaryLink] = useState('');
    const [actionButtons, setActionButtons] = useState<ActionButton[]>([]);
    const [windowsHero, setWindowsHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const [macHero, setMacHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const [androidHero, setAndroidHero] = useState<ImageValue>({ file: null, preview: null, originalPreview: null });
    const { logo, setLogo } = useSettings();
    const [sendingOption, setSendingOption] = useState('now');
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
    const [scheduledTime, setScheduledTime] = useState('10:00 AM');
    const [segmentId, setSegmentId] = useState('all');
    // Smart Delivery
    const [smartDeliver, setSmartDeliver] = useState(false);
    // Flash Sale
    const [flashSaleEnabled, setFlashSaleEnabled] = useState(false);
    const [flashSaleDiscountPercent, setFlashSaleDiscountPercent] = useState(20);
    const [flashSaleOriginalPrice, setFlashSaleOriginalPrice] = useState(0);
    const [flashSaleSalePrice, setFlashSaleSalePrice] = useState(0);
    const [flashSaleExpiresAt, setFlashSaleExpiresAt] = useState<Date | undefined>(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24 hours from now
    const [flashSaleUrgencyText, setFlashSaleUrgencyText] = useState('⏰ Limited time offer!');
    // Recurring
    const [recurringPattern, setRecurringPattern] = useState('');

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
        // Smart Delivery
        smartDeliver, setSmartDeliver,
        // Flash Sale
        flashSaleEnabled, setFlashSaleEnabled,
        flashSaleDiscountPercent, setFlashSaleDiscountPercent,
        flashSaleOriginalPrice, setFlashSaleOriginalPrice,
        flashSaleSalePrice, setFlashSaleSalePrice,
        flashSaleExpiresAt, setFlashSaleExpiresAt,
        flashSaleUrgencyText, setFlashSaleUrgencyText,
        // Recurring
        recurringPattern, setRecurringPattern,
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
