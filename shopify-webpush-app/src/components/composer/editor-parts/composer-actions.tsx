
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { handleSendLivePreview } from '@/lib/notification-service';
import { useCampaignState, clearCampaignDraft } from '@/context/campaign-context';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { saveCampaignDraft } from '@/lib/client/campaign-save-draft';
import { clearWizardLaunchMediaCache } from '@/lib/client/campaign-wizard-media';

import { Button } from "@/components/ui/button";
import { ArrowRight, Save, Eye, Loader2 } from "lucide-react";

export const ComposerActions = ({
    onContinueClick,
}: {
    onContinueClick: () => boolean;
}) => {
    const { toast } = useToast();
    const router = useRouter();
    const queryClient = useQueryClient();
    const shopDomain = useShopDomain();
    const {
        title,
        primaryLink,
        message,
        logo,
        windowsHero,
        macHero,
        androidHero,
        actionButtons,
        segmentId,
        sendingOption,
        scheduledDate,
        scheduledTime,
        smartDeliver,
        flashSaleEnabled,
        flashSaleDiscountPercent,
        flashSaleOriginalPrice,
        flashSaleSalePrice,
        flashSaleExpiresAt,
        flashSaleExpiresTime,
        flashSaleUrgencyText,
        draftCampaignId,
    } = useCampaignState();
    const [isSending, setIsSending] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const onSendPreview = async () => {
        if (!title) {
            toast({
                variant: "destructive",
                title: "Title is missing",
                description: "Please enter a title before sending a live preview.",
            });
            return;
        }

        setIsSending(true);
        try {
            await handleSendLivePreview({
                title: title,
                body: message,
                url: primaryLink,
                icon: logo.preview,
                image: macHero.preview,
            });
            toast({
                title: "Preview Sent!",
                description: "Check your device for the notification.",
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Preview Failed",
                description: error.message || "Could not send live preview.",
            });
            console.error(error);
        } finally {
            setIsSending(false);
        }
    };
    
    const onSaveDraft = async () => {
        if (!title?.trim()) {
            toast({
                variant: "destructive",
                title: "Title is missing",
                description: "Cannot save a draft without a title.",
            });
            return;
        }

        if (!shopDomain) {
            toast({
                variant: 'destructive',
                title: 'Draft save failed',
                description: 'Open Push Eagle from Shopify Admin before saving drafts.',
            });
            return;
        }

        setIsSaving(true);
        try {
            const { campaignsHref } = await saveCampaignDraft(
                {
                    shopDomain,
                    draftCampaignId,
                    title,
                    message,
                    primaryLink,
                    segmentId,
                    actionButtons,
                    logoPreview: logo.preview,
                    windowsHeroPreview: windowsHero.preview,
                    macHeroPreview: macHero.preview,
                    androidHeroPreview: androidHero.preview,
                    sendingOption,
                    scheduledDate,
                    scheduledTime,
                    smartDeliver,
                    flashSaleEnabled,
                    flashSaleDiscountPercent,
                    flashSaleOriginalPrice,
                    flashSaleSalePrice,
                    flashSaleExpiresAt,
                    flashSaleExpiresTime,
                    flashSaleUrgencyText,
                },
                queryClient,
            );

            toast({
                title: "Draft Saved!",
                description: "Your campaign has been saved as a draft.",
            });

            clearCampaignDraft(shopDomain);
            clearWizardLaunchMediaCache(shopDomain);
            router.push(campaignsHref);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Draft save failed',
                description: error instanceof Error ? error.message : 'Unexpected error while saving draft.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleContinue = () => {
        const isFormValid = onContinueClick();
        if (isFormValid) {
            const queryShop = new URLSearchParams(window.location.search).get('shop');
            const scheduleHref = queryShop
                ? `/campaigns/new/schedule?shop=${encodeURIComponent(queryShop)}`
                : '/campaigns/new/schedule';
            router.push(scheduleHref);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void onSaveDraft()} disabled={isSaving || isSending}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Saving...' : 'Save as Draft'}
            </Button>
            <Button variant="outline" onClick={onSendPreview} disabled={isSending || isSaving}>
                {isSending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Eye className="mr-2 h-4 w-4" />
                )}
                {isSending ? 'Sending...' : 'See live preview'}
            </Button>
            <Button onClick={handleContinue} disabled={isSaving}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
        </div>
    );
};
