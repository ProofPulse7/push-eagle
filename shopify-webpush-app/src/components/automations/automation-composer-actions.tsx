
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { handleSendLivePreview } from '@/lib/notification-service';
import { saveAutomationStep } from '@/app/actions/automation-actions';
import { useSettings } from '@/context/settings-context';

import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Loader2, Save } from "lucide-react";

// Simplified props to remove context dependency
interface AutomationComposerActionsProps {
    getAutomationData: () => any; // Function to get current state
    setSaveStatus: (status: 'Unsaved' | 'Saving...' | 'Changes saved') => void;
    automationPath: string;
}

export const AutomationComposerActions = ({
    getAutomationData,
    setSaveStatus,
    automationPath
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
        const { title, message, primaryLink, logo, macHero } = getAutomationData();
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
                image: macHero.preview,
            });
            toast({ title: "Preview Sent!", description: "Check your device." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Preview Failed", description: error.message });
        } finally {
            setIsSendingPreview(false);
        }
    };

    const onSave = async () => {
        const { title, message, primaryLink, logo, macHero, actionButtons } = getAutomationData();
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
            const dataToSave = {
                title,
                message,
                primaryLink,
                logoUrl: logo.preview,
                heroUrl: macHero.preview,
                actionButtons,
            };
            await saveAutomationStep(stepId, shopDomain, dataToSave);
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
