
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { handleSendLivePreview } from '@/lib/notification-service';

import { Button } from "@/components/ui/button";
import { ArrowRight, Save, Eye, Loader2 } from "lucide-react";

type ImageValue = { file: File | null; preview: string | null };

// Basic URL validation: starts with http/https and has a dot in it.
const isValidUrl = (url: string) => {
    try {
        const newUrl = new URL(url);
        return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
    } catch (e) {
        return false;
    }
};


export const ComposerActions = ({
    title,
    primaryLink,
    message,
    logo,
    macHero,
    onContinueClick,
}: {
    title: string;
    primaryLink: string;
    message: string;
    logo: ImageValue;
    macHero: ImageValue;
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
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsSaving(false);
        toast({
            title: "Draft Saved!",
            description: "Your campaign has been saved as a draft.",
        });
    }

    const handleContinue = () => {
        const isFormValid = onContinueClick();
        if (isFormValid) {
            const queryShop = new URLSearchParams(window.location.search).get('shop');
            const detailsHref = queryShop
                ? `/campaigns/new/details?shop=${encodeURIComponent(queryShop)}`
                : '/campaigns/new/details';
            router.push(detailsHref);
        }
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
