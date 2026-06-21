
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { handleSendLivePreview } from '@/lib/notification-service';
import { useCampaignState, clearCampaignDraft } from '@/context/campaign-context';
import { useShopDomain } from '@/hooks/use-shop-domain';
import {
  commitCampaignDraftSave,
  type SaveCampaignDraftInput,
} from '@/lib/client/campaign-save-draft';

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

    const scheduleHref = useMemo(
        () =>
            shopDomain
                ? `/campaigns/new/schedule?shop=${encodeURIComponent(shopDomain)}`
                : '/campaigns/new/schedule',
        [shopDomain],
    );

    useEffect(() => {
        router.prefetch(scheduleHref);
    }, [router, scheduleHref]);

    const buildDraftInput = (): SaveCampaignDraftInput => ({
        shopDomain: shopDomain || '',
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
    });

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
            await handleSendLivePreview(
                {
                    title: title,
                    body: message,
                    url: primaryLink,
                    icon: logo.preview,
                    image: macHero.preview,
                },
                shopDomain || undefined,
            );
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
    
    const onSaveDraft = () => {
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

        try {
            const draftInput = buildDraftInput();

            commitCampaignDraftSave(draftInput, queryClient, {
                onNavigate: (campaignsHref) => {
                    toast({
                        title: "Draft Saved!",
                        description: "Your campaign has been saved as a draft.",
                    });
                    clearCampaignDraft(shopDomain);
                    router.push(campaignsHref);
                },
                onError: (error) => {
                    toast({
                        variant: 'destructive',
                        title: 'Draft save failed',
                        description: error.message,
                    });
                },
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Draft save failed',
                description: error instanceof Error ? error.message : 'Unexpected error while saving draft.',
            });
        }
    };

    const handleContinue = () => {
        if (!onContinueClick()) {
            return;
        }

        router.push(scheduleHref);
    };

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSaveDraft} disabled={isSending}>
                <Save className="mr-2 h-4 w-4" />
                Save as Draft
            </Button>
            <Button variant="outline" onClick={onSendPreview} disabled={isSending}>
                {isSending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Eye className="mr-2 h-4 w-4" />
                )}
                {isSending ? 'Sending...' : 'See live preview'}
            </Button>
            <Button onClick={handleContinue}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
        </div>
    );
};
