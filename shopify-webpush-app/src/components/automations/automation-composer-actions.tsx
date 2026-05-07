
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { handleSendLivePreview } from '@/lib/notification-service';
import { useSettings } from '@/context/settings-context';

import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Loader2, Save } from "lucide-react";

// Simplified props to remove context dependency
interface AutomationComposerActionsProps {
    getAutomationData: () => any; // Function to get current state
    setSaveStatus: (status: 'Unsaved' | 'Saving...' | 'Changes saved') => void;
    automationPath: string;
    automationRuleKey?: 'welcome_subscriber' | 'cart_abandonment_30m' | 'browse_abandonment_15m' | 'shipping_notifications' | 'back_in_stock' | 'price_drop';
}

const parseApiResponse = async (response: Response): Promise<{ json: any | null; text: string }> => {
    const text = await response.text();
    if (!text) {
        return { json: null, text: '' };
    }

    try {
        return { json: JSON.parse(text), text };
    } catch {
        return { json: null, text };
    }
};

const buildResponseError = (fallback: string, payload: { json: any | null; text: string }) => {
    const jsonError = payload.json && typeof payload.json === 'object' ? payload.json.error : null;
    if (typeof jsonError === 'string' && jsonError.trim()) {
        return jsonError;
    }

    if (payload.text) {
        return `${fallback} ${payload.text.slice(0, 200)}`;
    }

    return fallback;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
});

const normalizeAutomationLink = (value: string | null | undefined) => {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return '';
    }

    try {
        const parsed = new URL(raw);
        if (parsed.pathname === '/api/track/automation-click') {
            const unwrapped = parsed.searchParams.get('u');
            if (unwrapped) {
                return unwrapped;
            }
        }
    } catch {
        return raw;
    }

    return raw;
};

const normalizeMediaHost = (value: string) => {
    try {
        const parsed = new URL(value);
        if (parsed.pathname.startsWith('/api/media/')) {
            return `${window.location.origin}${parsed.pathname}${parsed.search}`;
        }
    } catch {
        return value;
    }

    return value;
};

const resolveAutomationMediaUrl = async (sourceUrl: string | null | undefined, shopDomain: string): Promise<string | null> => {
    const value = String(sourceUrl ?? '').trim();
    if (!value) {
        return null;
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
        return normalizeMediaHost(value);
    }

    let dataUrl = value;
    if (value.startsWith('blob:')) {
        const response = await fetch(value);
        const blob = await response.blob();
        dataUrl = await blobToDataUrl(blob);
    }

    if (!dataUrl.startsWith('data:image/')) {
        return null;
    }

    const uploadResponse = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain, dataUrl }),
    });

    const uploadPayload = await parseApiResponse(uploadResponse);
    if (!uploadResponse.ok || !uploadPayload.json?.ok || !uploadPayload.json?.asset?.url) {
        throw new Error(buildResponseError('Failed to upload reminder image.', uploadPayload));
    }

    return String(uploadPayload.json.asset.url);
};

export const AutomationComposerActions = ({
    getAutomationData,
    setSaveStatus,
    automationPath,
    automationRuleKey = 'welcome_subscriber'
}: AutomationComposerActionsProps) => {
    const { toast } = useToast();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const { shopDomain: settingsShop } = useSettings();
    const stepId = params.id as string;
    const shopDomain = searchParams.get('shop') || settingsShop || '';

    const [isSendingPreview, setIsSendingPreview] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const onSendPreview = async () => {
        const { title, message, primaryLink, logo, windowsHero, macHero, androidHero } = getAutomationData();
        if (!title) {
            toast({ variant: "destructive", title: "Title is missing", description: "Please enter a title." });
            return;
        }
        setIsSendingPreview(true);
        try {
            await handleSendLivePreview({
                title: title,
                body: message,
                url: primaryLink,
                icon: logo.preview,
                image: macHero.preview || windowsHero.preview || androidHero.preview || null,
            });
            toast({ title: "Preview Sent!", description: "Check your device." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Preview Failed", description: error.message });
        } finally {
            setIsSendingPreview(false);
        }
    };

    const onSave = async () => {
        const { title, message, primaryLink, logo, windowsHero, macHero, androidHero, actionButtons } = getAutomationData();
        if (!title) {
            toast({ variant: "destructive", title: "Title is missing", description: "Cannot save without a title." });
            return;
        }
        if (!shopDomain) {
            toast({ variant: "destructive", title: "Shop context missing", description: "Re-open this automation from Shopify and try again." });
            return;
        }
        setIsSaving(true);
        setSaveStatus('Saving...');
        try {
            const [logoUrl, windowsHeroUrl, macHeroUrl, androidHeroUrl] = await Promise.all([
                resolveAutomationMediaUrl(logo.preview, shopDomain),
                resolveAutomationMediaUrl(windowsHero.preview, shopDomain),
                resolveAutomationMediaUrl(macHero.preview, shopDomain),
                resolveAutomationMediaUrl(androidHero.preview, shopDomain),
            ]);

            const stepPatch = {
                title,
                body: message,
                targetUrl: normalizeAutomationLink(primaryLink),
                iconUrl: logoUrl,
                imageUrl: macHeroUrl,
                windowsImageUrl: windowsHeroUrl,
                macosImageUrl: macHeroUrl,
                androidImageUrl: androidHeroUrl,
                actionButtons,
            };

            const saveResponse = await fetch('/api/automations/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopDomain,
                    ruleKey: automationRuleKey,
                    config: {
                        steps: {
                            [stepId]: stepPatch,
                        },
                    },
                }),
            });

            const savePayload = await parseApiResponse(saveResponse);
            if (!saveResponse.ok || !savePayload.json?.ok) {
                throw new Error(buildResponseError('Failed to save reminder settings.', savePayload));
            }

            toast({ title: "Automation Saved!", description: "Your changes have been saved successfully." });
            setSaveStatus('Changes saved');
            setTimeout(() => router.push(automationPath), 1000);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Save Failed", description: error.message });
            setSaveStatus('Unsaved');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
                <Link href={automationPath}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Flow
                </Link>
            </Button>
            <Button variant="outline" onClick={onSendPreview} disabled={isSendingPreview || isSaving}>
                {isSendingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                {isSendingPreview ? 'Sending...' : 'See live preview'}
            </Button>
            <Button onClick={onSave} disabled={isSaving || isSendingPreview}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Saving...' : 'Save Automation'}
            </Button>
        </div>
    );
};
