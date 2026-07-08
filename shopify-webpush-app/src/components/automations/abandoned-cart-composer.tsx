'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import TextareaAutosize from 'react-textarea-autosize';
import { useAutomationState } from '@/context/automation-context';
import { useSettings } from '@/context/settings-context';
import { formatStoreDisplayName, resolveMerchantWebsiteUrl } from '@/lib/client/merchant-website-url';

import { IOSPreview } from '../composer/previews/ios-preview';
import { AndroidPreview } from '../composer/previews/android-preview';
import { WindowsPreview } from '../composer/previews/windows-preview';
import { MacOSPreview } from '../composer/previews/macos-preview';

import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ArrowLeft, Check, Lightbulb, Loader2, Smile } from 'lucide-react';
import { LogoUploaderEditor } from '../composer/editor-parts/logo-uploader-editor';
import { ImageEditorSheet } from '../composer/editor-parts/image-editor-sheet';
import { AutomationComposerActions } from './automation-composer-actions';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

const InfoBox = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-yellow-500/10 p-2 rounded-md border border-yellow-500/20 mt-2">
        <Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
        <p>{children}</p>
    </div>
);

const resolveCartPageDisplayUrl = (storeUrl: string, targetUrl: string) => {
    const cartPath = targetUrl.startsWith('/') ? targetUrl : '/cart';
    const merchantUrl = resolveMerchantWebsiteUrl({ storeUrl });
    if (merchantUrl) {
        return `${merchantUrl.replace(/\/$/, '')}${cartPath}`;
    }

    const host = formatStoreDisplayName(storeUrl);
    return host ? `${host}${cartPath}` : cartPath;
};

const AbandonedCartEditorPanel = ({ cartPageUrl, handleImageUpload, setEditingState }: {
    cartPageUrl: string;
    handleImageUpload: (file: File | undefined, imageType: 'windows' | 'mac' | 'android' | 'logo') => void;
    setEditingState: (state: { url: string; aspect: number; type: string } | null) => void;
}) => {
    const { title, setTitle, message, setMessage, actionButtons, setActionButtons, logo, setLogo } = useAutomationState();
    const handleTitleEmojiSelect = (emoji: { emoji: string }) => setTitle(`${title}${emoji.emoji}`);
    const handleMessageEmojiSelect = (emoji: { emoji: string }) => setMessage(`${message}${emoji.emoji}`);
    const MESSAGE_LIMIT = 100;

    const handleButtonChange = (index: number, field: 'title' | 'link', value: string) => {
        const newButtons = [...actionButtons];
        // Ensure the button object exists before trying to modify it
        if (!newButtons[index]) {
            newButtons[index] = { title: '', link: '' };
        }
        newButtons[index] = { ...newButtons[index], [field]: value };
        setActionButtons(newButtons);
    };
    
    return (
        <div className="p-4 space-y-6">
             <div className="space-y-1.5">
                <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
                <div className="relative">
                    <Input id="title" placeholder="Your title here" value={title} onChange={e => setTitle(e.target.value)} className="pr-10" />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button size="icon" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8">
                                <Smile className="h-5 w-5 text-muted-foreground" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-0">
                            <EmojiPicker onEmojiClick={handleTitleEmojiSelect} />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="message">Message</Label>
                <div className="relative">
                    <TextareaAutosize
                        id="message"
                        maxLength={MESSAGE_LIMIT}
                        placeholder="Your message here"
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pr-10 min-h-[80px]"
                    />
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button size="icon" variant="ghost" className="absolute right-1 bottom-2 h-8 w-8">
                                <Smile className="h-5 w-5 text-muted-foreground" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-0">
                            <EmojiPicker onEmojiClick={handleMessageEmojiSelect} />
                        </PopoverContent>
                    </Popover>
                </div>
                {message.length <= MESSAGE_LIMIT ? (
                    <p className="text-xs text-right text-muted-foreground">{message.length} / {MESSAGE_LIMIT}</p>
                ) : (
                    <p className="text-xs text-right text-destructive">
                        {message.length - MESSAGE_LIMIT} character{message.length - MESSAGE_LIMIT !== 1 ? 's' : ''} exceeded. Some text may not be visible in all notifications.
                    </p>
                )}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="primaryLink">Primary link</Label>
                <Input id="primaryLink" value={cartPageUrl} disabled />
                <InfoBox>By default, PushEagle will use your cart page for the redirect link.</InfoBox>
            </div>

             <div className="space-y-2">
                <Label>Hero image</Label>
                <InfoBox>PushEagle will automatically use the product image for this push notification.</InfoBox>
            </div>

            <div className="space-y-2">
                <Label>Button 1</Label>
                <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                     <div className="space-y-1.5">
                        <Label htmlFor="btn-1-title" className="text-muted-foreground">Title</Label>
                        <Input id="btn-1-title" value={actionButtons[0]?.title || 'Checkout'} onChange={(e) => handleButtonChange(0, 'title', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="btn-1-link" className="text-muted-foreground">Link</Label>
                        <Input id="btn-1-link" value={cartPageUrl} disabled />
                         <InfoBox>By default, PushEagle will use your cart page for button 1 link.</InfoBox>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Button 2</Label>
                 <div className="space-y-2 rounded-md border p-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="btn-2-title">Title</Label>
                        <Input id="btn-2-title" placeholder="e.g., Continue Shopping" value={actionButtons[1]?.title || ''} onChange={(e) => handleButtonChange(1, 'title', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="btn-2-link">Link</Label>
                        <Input id="btn-2-link" placeholder="https://..." value={actionButtons[1]?.link || ''} onChange={(e) => handleButtonChange(1, 'link', e.target.value)} />
                    </div>
                </div>
            </div>
            
            <LogoUploaderEditor 
                logo={logo}
                setLogo={setLogo}
                handleImageUpload={handleImageUpload}
                setEditingState={setEditingState}
            />
        </div>
    )
}


export function AbandonedCartComposer({ reminderTitle }: { reminderTitle: string }) {
    const { 
        title, message, primaryLink, logo, actionButtons, setLogo,
        windowsHero, macHero, androidHero,
    } = useAutomationState();
    const { storeUrl } = useSettings();
    
    const [editingState, setEditingState] = useState<{ url: string; aspect: number; type: string } | null>(null);
    const [saveStatus, setSaveStatus] = useState<'Unsaved' | 'Saving...' | 'Changes saved'>('Unsaved');

    const cartPageUrl = useMemo(
        () => resolveCartPageDisplayUrl(storeUrl, primaryLink || '/cart'),
        [storeUrl, primaryLink],
    );

    const generatedHero = "data:image/svg+xml,%3csvg width='728' height='360' viewBox='0 0 728 360' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='728' height='360' fill='%23E2E8F0'/%3e%3ctext fill='%2364748B' font-family='Arial' font-size='24' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3ePRODUCT IMAGE IS GENERATED AUTOMATICALLY%3c/text%3e%3c/svg%3e";

    const handleImageUpload = (file: File | undefined, imageType: 'windows' | 'mac' | 'android' | 'logo') => {
        if (!file) return;
        const previewUrl = URL.createObjectURL(file);
        if (imageType === 'logo') {
            setLogo({ file, preview: previewUrl });
        }
    };

    const handleEditedImageSave = (dataUrl: string, type: string) => {
        if (type === 'logo') {
            setLogo({ file: null, preview: dataUrl });
        }
    };

    useEffect(() => {
        const hasContent = title || message || logo.file || actionButtons.length > 0;
        if (!hasContent) {
            setSaveStatus('Unsaved');
            return;
        }

        setSaveStatus('Saving...');
        const handler = setTimeout(() => {
            setSaveStatus('Changes saved');
        }, 1500);

        return () => clearTimeout(handler);
    }, [title, message, logo, actionButtons]);

    const getAutomationData = () => ({
        title,
        message,
        primaryLink: primaryLink || '/cart',
        logo,
        windowsHero,
        macHero,
        androidHero,
        actionButtons,
    });

    return (
        <div className="h-screen w-full grid grid-cols-1 lg:grid-cols-[minmax(0,_480px)_1fr]">
            <div className="bg-card border-r flex flex-col h-screen">
                <div className="p-4 border-b flex items-center justify-between shrink-0 gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <Button variant="outline" size="icon" asChild className="shrink-0">
                            <Link href="/automations/abandoned-cart-recovery">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <h2 className="text-lg font-semibold truncate">Abandoned cart recovery - {reminderTitle}</h2>
                    </div>
                    {saveStatus === 'Saving...' ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-2 shrink-0">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Saving...</span>
                        </p>
                    ) : saveStatus === 'Changes saved' ? (
                        <p className="text-sm text-green-600 flex items-center gap-2 shrink-0">
                            <Check className="h-4 w-4" />
                            <span>Changes saved</span>
                        </p>
                    ) : (
                        <p className="text-sm text-muted-foreground flex items-center gap-2 shrink-0">
                            <Check className="h-4 w-4 opacity-0" />
                            <span>Unsaved changes</span>
                        </p>
                    )}
                </div>

                <ScrollArea type="always" className="flex-grow campaign-creator-scroll-area">
                   <AbandonedCartEditorPanel
                        cartPageUrl={cartPageUrl}
                        handleImageUpload={handleImageUpload}
                        setEditingState={setEditingState}
                   />
                </ScrollArea>
            </div>

            <div className="h-screen bg-background flex flex-col">
                <div className="flex-grow overflow-y-auto">
                    <div className="grid min-h-full grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-px bg-slate-300/80 dark:bg-slate-700">
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                            <AndroidPreview
                                title={title}
                                message={message}
                                link={cartPageUrl}
                                icon={logo.preview}
                                hero={generatedHero}
                                actionButtons={actionButtons}
                            />
                        </div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                            <WindowsPreview
                                title={title}
                                message={message}
                                link={cartPageUrl}
                                hero={generatedHero}
                                actionButtons={actionButtons}
                            />
                        </div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                           <MacOSPreview
                                title={title}
                                message={message}
                                link={cartPageUrl}
                                icon={logo.preview}
                                hero={generatedHero}
                                actionButtons={actionButtons}
                            />
                        </div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                            <IOSPreview
                                title={title}
                                message={message}
                                link={cartPageUrl}
                                icon={logo.preview}
                            />
                        </div>
                    </div>
                </div>
                <div className="shrink-0 p-4 border-t bg-card flex justify-end items-center">
                    <AutomationComposerActions
                        setSaveStatus={setSaveStatus}
                        getAutomationData={getAutomationData}
                        automationPath="/automations/abandoned-cart-recovery"
                        automationRuleKey="cart_abandonment_30m"
                    />
                </div>
            </div>

            <ImageEditorSheet 
                editingState={editingState}
                setEditingState={setEditingState}
                onSave={handleEditedImageSave}
            />
        </div>
    )
}
