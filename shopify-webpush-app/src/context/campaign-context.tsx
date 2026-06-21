'use client';
import {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSettings } from '@/context/settings-context';
import { useShopDomain } from '@/hooks/use-shop-domain';
import {
  readCampaignDraft,
  writeCampaignDraft,
  clearCampaignDraft,
  type CampaignDraftSnapshot,
} from '@/lib/client/campaign-draft-storage';
import {
  FRESH_CAMPAIGN_QUERY_PARAM,
  isCampaignWizardRoute,
  isCampaignWizardStepPath,
} from '@/lib/client/campaign-wizard-routes';
import { clearWizardLaunchMediaCache, readPersistableImageSource } from '@/lib/client/campaign-wizard-media';
import {
  isMyshopifyHost,
  normalizeMerchantWebsiteUrl,
  resolveMerchantWebsiteUrl,
} from '@/lib/client/merchant-website-url';
import { getDefaultCampaignScheduleDefaults } from '@/lib/client/campaign-schedule';

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
  flashSaleExpiresTime: string;
  setFlashSaleExpiresTime: (value: string) => void;
  flashSaleUrgencyText: string;
  setFlashSaleUrgencyText: (text: string) => void;
  recurringPattern: string;
  setRecurringPattern: (pattern: string) => void;
  draftCampaignId: string | null;
  setDraftCampaignId: (id: string | null) => void;
}

export const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

const emptyImage = (): ImageValue => ({ file: null, preview: null, originalPreview: null });

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

const imageFromDraft = (value: CampaignDraftSnapshot['windowsHero']): ImageValue => ({
  file: null,
  preview: value.preview,
  originalPreview: value.originalPreview ?? null,
});

const buildDraftSnapshot = (state: {
  title: string;
  message: string;
  primaryLink: string;
  actionButtons: ActionButton[];
  windowsHero: ImageValue;
  macHero: ImageValue;
  androidHero: ImageValue;
  logo: ImageValue;
  sendingOption: string;
  scheduledDate: Date | undefined;
  scheduledTime: string;
  segmentId: string;
  smartDeliver: boolean;
  flashSaleEnabled: boolean;
  flashSaleDiscountPercent: number;
  flashSaleOriginalPrice: number;
  flashSaleSalePrice: number;
  flashSaleExpiresAt: Date | undefined;
  flashSaleExpiresTime: string;
  flashSaleUrgencyText: string;
  recurringPattern: string;
  draftCampaignId?: string | null;
}): CampaignDraftSnapshot => ({
  draftCampaignId: state.draftCampaignId ?? null,
  title: state.title,
  message: state.message,
  primaryLink: state.primaryLink,
  actionButtons: state.actionButtons,
  windowsHero: {
    preview: state.windowsHero.preview,
    originalPreview: state.windowsHero.originalPreview ?? null,
  },
  macHero: {
    preview: state.macHero.preview,
    originalPreview: state.macHero.originalPreview ?? null,
  },
  androidHero: {
    preview: state.androidHero.preview,
    originalPreview: state.androidHero.originalPreview ?? null,
  },
  logo: {
    preview: state.logo.preview,
    originalPreview: state.logo.originalPreview ?? null,
  },
  sendingOption: state.sendingOption,
  scheduledDate: state.scheduledDate ? state.scheduledDate.toISOString() : null,
  scheduledTime: state.scheduledTime,
  segmentId: state.segmentId,
  smartDeliver: state.smartDeliver,
  flashSaleEnabled: state.flashSaleEnabled,
  flashSaleDiscountPercent: state.flashSaleDiscountPercent,
  flashSaleOriginalPrice: state.flashSaleOriginalPrice,
  flashSaleSalePrice: state.flashSaleSalePrice,
  flashSaleExpiresAt: state.flashSaleExpiresAt ? state.flashSaleExpiresAt.toISOString() : null,
  flashSaleExpiresTime: state.flashSaleExpiresTime,
  flashSaleUrgencyText: state.flashSaleUrgencyText,
  recurringPattern: state.recurringPattern,
  updatedAt: Date.now(),
});

export function useCampaignState() {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error('useCampaignState must be used within NewCampaignLayout');
  }
  return context;
}

export function CampaignStateProvider({ children }: { children: ReactNode }) {
  const shop = useShopDomain();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPathRef = useRef(pathname);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const primaryLinkInitializedRef = useRef(false);
  const skipPrimaryLinkDefaultRef = useRef(false);
  const didHydrateDraftRef = useRef(false);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [primaryLink, setPrimaryLink] = useState('');
  const [actionButtons, setActionButtons] = useState<ActionButton[]>([]);
  const [windowsHero, setWindowsHero] = useState<ImageValue>(emptyImage);
  const [macHero, setMacHero] = useState<ImageValue>(emptyImage);
  const [androidHero, setAndroidHero] = useState<ImageValue>(emptyImage);
  const [logo, setLogo] = useState<ImageValue>(emptyImage);
  const { storeUrl, logo: settingsLogo } = useSettings();
  const scheduleDefaults = getDefaultCampaignScheduleDefaults();
  const [sendingOption, setSendingOption] = useState('now');
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(scheduleDefaults.scheduledDate);
  const [scheduledTime, setScheduledTime] = useState(scheduleDefaults.scheduledTime);
  const [segmentId, setSegmentId] = useState('all');
  const [smartDeliver, setSmartDeliver] = useState(false);
  const [flashSaleEnabled, setFlashSaleEnabled] = useState(false);
  const [flashSaleDiscountPercent, setFlashSaleDiscountPercent] = useState(20);
  const [flashSaleOriginalPrice, setFlashSaleOriginalPrice] = useState(0);
  const [flashSaleSalePrice, setFlashSaleSalePrice] = useState(0);
  const [flashSaleExpiresAt, setFlashSaleExpiresAt] = useState<Date | undefined>(scheduleDefaults.flashSaleExpiresAt);
  const [flashSaleExpiresTime, setFlashSaleExpiresTime] = useState(scheduleDefaults.flashSaleExpiresTime);
  const [flashSaleUrgencyText, setFlashSaleUrgencyText] = useState('⏰ Limited time offer!');
  const [recurringPattern, setRecurringPattern] = useState('');
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);

  const resetCampaignState = useCallback(() => {
    const defaults = getDefaultCampaignScheduleDefaults();
    setTitle('');
    setMessage('');
    setPrimaryLink('');
    setActionButtons([]);
    setWindowsHero(emptyImage());
    setMacHero(emptyImage());
    setAndroidHero(emptyImage());
    setLogo(emptyImage());
    setSendingOption('now');
    setScheduledDate(defaults.scheduledDate);
    setScheduledTime(defaults.scheduledTime);
    setSegmentId('all');
    setSmartDeliver(false);
    setFlashSaleEnabled(false);
    setFlashSaleDiscountPercent(20);
    setFlashSaleOriginalPrice(0);
    setFlashSaleSalePrice(0);
    setFlashSaleExpiresAt(defaults.flashSaleExpiresAt);
    setFlashSaleExpiresTime(defaults.flashSaleExpiresTime);
    setFlashSaleUrgencyText('⏰ Limited time offer!');
    setRecurringPattern('');
    setDraftCampaignId(null);
    primaryLinkInitializedRef.current = false;
    skipPrimaryLinkDefaultRef.current = false;
  }, []);

  const applyDraft = useCallback((draft: CampaignDraftSnapshot) => {
    setDraftCampaignId(draft.draftCampaignId ?? null);
    setTitle(draft.title);
    setMessage(draft.message);
    setPrimaryLink(draft.primaryLink);
    setActionButtons(draft.actionButtons);
    setWindowsHero(imageFromDraft(draft.windowsHero));
    setMacHero(imageFromDraft(draft.macHero));
    setAndroidHero(imageFromDraft(draft.androidHero));
    setLogo(imageFromDraft(draft.logo));
    setSendingOption(draft.sendingOption);
    setScheduledDate(draft.scheduledDate ? new Date(draft.scheduledDate) : getDefaultCampaignScheduleDefaults().scheduledDate);
    setScheduledTime(draft.scheduledTime || getDefaultCampaignScheduleDefaults().scheduledTime);
    setSegmentId(draft.segmentId);
    setSmartDeliver(draft.smartDeliver);
    setFlashSaleEnabled(draft.flashSaleEnabled);
    setFlashSaleDiscountPercent(draft.flashSaleDiscountPercent);
    setFlashSaleOriginalPrice(draft.flashSaleOriginalPrice);
    setFlashSaleSalePrice(draft.flashSaleSalePrice);
    setFlashSaleExpiresAt(
      draft.flashSaleExpiresAt
        ? new Date(draft.flashSaleExpiresAt)
        : getDefaultCampaignScheduleDefaults().flashSaleExpiresAt,
    );
    setFlashSaleExpiresTime(draft.flashSaleExpiresTime || getDefaultCampaignScheduleDefaults().flashSaleExpiresTime);
    setFlashSaleUrgencyText(draft.flashSaleUrgencyText);
    setRecurringPattern(draft.recurringPattern);
    primaryLinkInitializedRef.current = Boolean(draft.primaryLink.trim());
    skipPrimaryLinkDefaultRef.current = Boolean(draft.primaryLink.trim());
  }, []);

  useEffect(() => {
    if (!shop || !isCampaignWizardRoute(pathname)) {
      return;
    }

    if (searchParams.get(FRESH_CAMPAIGN_QUERY_PARAM) === '1') {
      clearCampaignDraft(shop);
      clearWizardLaunchMediaCache(shop);
      resetCampaignState();
      if (settingsLogo.preview) {
        setLogo({
          file: null,
          preview: settingsLogo.preview,
          originalPreview: settingsLogo.originalPreview ?? null,
        });
      }
      return;
    }

    if (didHydrateDraftRef.current) {
      return;
    }

    didHydrateDraftRef.current = true;

    const draft = readCampaignDraft(shop);
    if (draft) {
      applyDraft(draft);
    }
  }, [shop, pathname, applyDraft, resetCampaignState, searchParams, settingsLogo.preview, settingsLogo.originalPreview]);

  useEffect(() => {
    const wasInWizard = isCampaignWizardRoute(prevPathRef.current);
    const inWizard = isCampaignWizardRoute(pathname);

    if (wasInWizard && !inWizard) {
      if (shop) {
        clearCampaignDraft(shop);
        clearWizardLaunchMediaCache(shop);
      }
      resetCampaignState();
    }

    if (inWizard && !wasInWizard && searchParams.get(FRESH_CAMPAIGN_QUERY_PARAM) !== '1') {
      const draft = shop ? readCampaignDraft(shop) : null;
      if (draft) {
        applyDraft(draft);
      } else {
        resetCampaignState();
        if (settingsLogo.preview) {
          setLogo({
            file: null,
            preview: settingsLogo.preview,
            originalPreview: settingsLogo.originalPreview ?? null,
          });
        }
      }
    }

    prevPathRef.current = pathname;
  }, [pathname, shop, applyDraft, resetCampaignState, searchParams, settingsLogo.preview, settingsLogo.originalPreview]);

  useEffect(() => {
    if (!shop || !isCampaignWizardStepPath(pathname)) {
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        const persistImage = async (image: ImageValue) => ({
          file: null as File | null,
          preview: await readPersistableImageSource(image.preview),
          originalPreview: await readPersistableImageSource(image.originalPreview ?? image.preview),
        });

        const [persistedWindowsHero, persistedMacHero, persistedAndroidHero, persistedLogo] = await Promise.all([
          persistImage(windowsHero),
          persistImage(macHero),
          persistImage(androidHero),
          persistImage(logo),
        ]);

        if (cancelled) {
          return;
        }

        writeCampaignDraft(
          shop,
          buildDraftSnapshot({
            title,
            message,
            primaryLink,
            actionButtons,
            windowsHero: persistedWindowsHero,
            macHero: persistedMacHero,
            androidHero: persistedAndroidHero,
            logo: persistedLogo,
            sendingOption,
            scheduledDate,
            scheduledTime,
            segmentId,
            smartDeliver,
            flashSaleEnabled,
            flashSaleDiscountPercent,
            flashSaleOriginalPrice,
            flashSaleSalePrice,
            flashSaleExpiresAt,
            flashSaleExpiresTime,
            flashSaleUrgencyText,
            recurringPattern,
            draftCampaignId,
          }),
        );
      })();
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    shop,
    pathname,
    title,
    message,
    primaryLink,
    actionButtons,
    windowsHero,
    macHero,
    androidHero,
    logo,
    sendingOption,
    scheduledDate,
    scheduledTime,
    segmentId,
    smartDeliver,
    flashSaleEnabled,
    flashSaleDiscountPercent,
    flashSaleOriginalPrice,
    flashSaleSalePrice,
    flashSaleExpiresAt,
    flashSaleExpiresTime,
    flashSaleUrgencyText,
    recurringPattern,
    draftCampaignId,
  ]);

  useEffect(() => {
    const normalizedLink = normalizeTrackedLink(primaryLink);
    if (normalizedLink !== primaryLink) {
      setPrimaryLink(normalizedLink);
      return;
    }

    if (skipPrimaryLinkDefaultRef.current || primaryLinkInitializedRef.current) {
      return;
    }

    const merchantWebsiteUrl = resolveMerchantWebsiteUrl({ storeUrl });
    if (!merchantWebsiteUrl) {
      return;
    }

    if (!primaryLink || isMyshopifyHost(primaryLink)) {
      setPrimaryLink(merchantWebsiteUrl);
      primaryLinkInitializedRef.current = true;
      return;
    }

    const normalizedPrimary = normalizeMerchantWebsiteUrl(primaryLink);
    if (normalizedPrimary && isMyshopifyHost(normalizedPrimary)) {
      setPrimaryLink(merchantWebsiteUrl);
      primaryLinkInitializedRef.current = true;
    }
  }, [primaryLink, storeUrl]);

  const setPrimaryLinkSafe = useCallback((link: string) => {
    skipPrimaryLinkDefaultRef.current = Boolean(link.trim());
    primaryLinkInitializedRef.current = Boolean(link.trim());
    setPrimaryLink(link);
  }, []);

  const value: CampaignContextType = {
    title,
    setTitle,
    message,
    setMessage,
    primaryLink,
    setPrimaryLink: setPrimaryLinkSafe,
    actionButtons,
    setActionButtons,
    windowsHero,
    setWindowsHero,
    macHero,
    setMacHero,
    androidHero,
    setAndroidHero,
    logo,
    setLogo,
    sendingOption,
    setSendingOption,
    scheduledDate,
    setScheduledDate,
    scheduledTime,
    setScheduledTime,
    segmentId,
    setSegmentId,
    smartDeliver,
    setSmartDeliver,
    flashSaleEnabled,
    setFlashSaleEnabled,
    flashSaleDiscountPercent,
    setFlashSaleDiscountPercent,
    flashSaleOriginalPrice,
    setFlashSaleOriginalPrice,
    flashSaleSalePrice,
    setFlashSaleSalePrice,
    flashSaleExpiresAt,
    setFlashSaleExpiresAt,
    flashSaleExpiresTime,
    setFlashSaleExpiresTime,
    flashSaleUrgencyText,
    setFlashSaleUrgencyText,
    recurringPattern,
    setRecurringPattern,
    draftCampaignId,
    setDraftCampaignId,
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

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export { clearCampaignDraft };
