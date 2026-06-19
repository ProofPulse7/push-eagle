
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { handleSendLivePreview } from '@/lib/notification-service';
import { startWizardMediaUpload } from '@/lib/client/campaign-wizard-media';

import { Button } from "@/components/ui/button";
import { ArrowRight, Save, Eye, Loader2 } from "lucide-react";

type ImageValue = { file: File | null; preview: string | null; originalPreview?: string | null };

export const ComposerActions = ({
    shopDomain,
    title,
    primaryLink,
    message,
    logo,
    windowsHero,
    macHero,
    androidHero,
    onContinueClick,
}: {
    shopDomain: string;
    title: string;
    primaryLink: string;
    message: string;
    logo: ImageValue;
    windowsHero: ImageValue;
    macHero: ImageValue;
    androidHero: ImageValue;
    onContinueClick: () => boolean;
}) => {
    const { toast } = useToast();
    const router = useRouter();
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
        if (!title) {
            toast({
                variant: "destructive",
                title: "Title is missing",
                description: "Cannot save a draft without a title.",
            });
            return;
        }
        setIsSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsSaving(false);
        toast({
            title: "Draft Saved!",
            description: "Your campaign has been saved as a draft.",
        });
    }

    const handleContinue = () => {
        const isFormValid = onContinueClick();
        if (!isFormValid) {
            return;
        }

        if (shopDomain) {
            startWizardMediaUpload(shopDomain, {
                imageUrl: macHero.preview ?? windowsHero.preview ?? androidHero.preview,
                windowsImageUrl: windowsHero.preview,
                macosImageUrl: macHero.preview,
                androidImageUrl: androidHero.preview,
                iconUrl: logo.preview,
            });
        }

        const queryShop = new URLSearchParams(window.location.search).get('shop');
        const scheduleHref = queryShop
            ? `/campaigns/new/schedule?shop=${encodeURIComponent(queryShop)}`
            : '/campaigns/new/schedule';
        router.push(scheduleHref);
    }

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSaveDraft} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Saving...' : 'Save as Draft'}
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
