
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCampaignState } from '@/context/campaign-context';

import { Button } from "@/components/ui/button";
import { useToast } from '@/hooks/use-toast';

import { suggestNotificationCopy } from '@/ai/flows';
import { Loader2, Check, ArrowLeft } from "lucide-react";

import { IOSPreview } from './previews/ios-preview';
import { AndroidPreview } from './previews/android-preview';
import { WindowsPreview } from './previews/windows-preview';
import { MacOSPreview } from './previews/macos-preview';

import { ContentEditor } from './editor-parts/content-editor';
import { RichMediaEditor } from './editor-parts/rich-media-editor';
import { ActionButtonsEditor } from './editor-parts/action-buttons-editor';
import { LogoUploaderEditor } from './editor-parts/logo-uploader-editor';
import { ImageEditorSheet } from './editor-parts/image-editor-sheet';
import { ScrollArea } from '../ui/scroll-area';
import { ComposerActions } from './editor-parts/composer-actions';

// Basic URL validation
const isValidUrl = (url: string) => {
    const parts = url.split('.');
    if (parts.length < 2) {
        return false; // Must have at least one dot
    }
    const domainPart = parts[0].replace(/^(https?:\/\/)/, '');
    if (domainPart.length < 2) {
        return false; // Must have at least two characters before the dot
    }
    if (parts[parts.length - 1].length < 2) {
        return false; // Must have at least two characters after the last dot
    }
    return true;
};

export function Composer() {
    const { 
        title, setTitle, 
        message, setMessage, 
        primaryLink, setPrimaryLink,
        actionButtons, setActionButtons,
        windowsHero, setWindowsHero,
        macHero, setMacHero,
        androidHero, setAndroidHero,
        logo, setLogo,
    } = useCampaignState();
    
    const [showWindowsWarning, setShowWindowsWarning] = useState(false);
    const [showMacWarning, setShowMacWarning] = useState(false);
    const [showAndroidWarning, setShowAndroidWarning] = useState(false);

    const [editingState, setEditingState] = useState<{ url: string; aspect: number, type: string } | null>(null);
    const [saveStatus, setSaveStatus] = useState<'Unsaved' | 'Saving...' | 'Changes saved'>('Unsaved');
    const [isGenerating, setIsGenerating] = useState(false);
    const [errors, setErrors] = useState<{ title?: string, primaryLink?: string }>({});
    const { toast } = useToast();

    const handleTitleEmojiSelect = (emoji: { emoji: string }) => {
        setTitle(`${title}${emoji.emoji}`);
    };
    const handleMessageEmojiSelect = (emoji: { emoji: string }) => {
        setMessage(`${message}${emoji.emoji}`);
    };

    const checkImageDimensions = (file: File, type: 'windows' | 'mac' | 'android') => {
        const img = new window.Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = () => {
                const { naturalWidth: w, naturalHeight: h } = img;
                const dims = {
                    windows: { w: 728, h: 360 },
                    mac: { w: 704, h: 512 },
                    android: { w: 720, h: 240 },
                };
                const warningSetters = {
                    windows: setShowWindowsWarning,
                    mac: setShowMacWarning,
                    android: setShowAndroidWarning,
                };
                const required = dims[type];
                warningSetters[type](w !== required.w || h !== required.h);
            };
            if (e.target?.result) {
                img.src = e.target.result as string;
            }
        };
        reader.readAsDataURL(file);
    };

    const handleImageUpload = (file: File | undefined, imageType: 'windows' | 'mac' | 'android' | 'logo') => {
        if (!file) return;

        const isFirstHeroUpload = !windowsHero.file && !macHero.file && !androidHero.file && imageType !== 'logo';
        const previewUrl = URL.createObjectURL(file);

        if (imageType === 'logo') {
            setLogo({ file, preview: previewUrl });
        } else {
            const newImageValue = { file, preview: previewUrl };
            if (isFirstHeroUpload) {
                setWindowsHero(newImageValue);
                setMacHero(newImageValue);
                setAndroidHero(newImageValue);
                checkImageDimensions(file, 'windows');
                checkImageDimensions(file, 'mac');
                checkImageDimensions(file, 'android');
            } else {
                const setterMap = {
                    windows: setWindowsHero,
                    mac: setMacHero,
                    android: setAndroidHero,
                };
                setterMap[imageType](newImageValue);
                checkImageDimensions(file, imageType);
            }
        }
    };
    
    const handleSaveCrop = (croppedDataUrl: string, type: string) => {
        const setters = {
            windows: setWindowsHero,
            mac: setMacHero,
            android: setAndroidHero,
            logo: setLogo
        };
        const warningSetters = {
            windows: setShowWindowsWarning,
            mac: setShowMacWarning,
            android: setShowAndroidWarning,
        };

        if (type === 'windows') {
            setWindowsHero({ ...windowsHero, preview: croppedDataUrl, file: null });
        } else if (type === 'mac') {
            setMacHero({ ...macHero, preview: croppedDataUrl, file: null });
        } else if (type === 'android') {
            setAndroidHero({ ...androidHero, preview: croppedDataUrl, file: null });
        } else if (type === 'logo') {
            setLogo({ ...logo, preview: croppedDataUrl, file: null });
        }

        const warningSetter = warningSetters[type as keyof typeof warningSetters];
        if (warningSetter) {
            warningSetter(false); // Hide warning after crop
        }
    };

    useEffect(() => {
        const hasContent = title || message || primaryLink || windowsHero.file || macHero.file || androidHero.file || logo.file || actionButtons.length > 0;
        if (!hasContent) {
            setSaveStatus('Unsaved');
            return;
        };

        setSaveStatus('Saving...');
        const handler = setTimeout(() => {
            setSaveStatus('Changes saved');
        }, 1500);

        return () => clearTimeout(handler);
    }, [title, message, primaryLink, windowsHero, macHero, androidHero, logo, actionButtons]);
    
    const handleGenerateCopy = async (brandVoice?: string) => {
        setIsGenerating(true);
        try {
            const result = await suggestNotificationCopy({ 
                topic: title || "Summer Collection Launch", 
                targetAudience: "Fashion lovers", 
                goal: brandVoice || "drive sales",
                brandVoice: brandVoice,
                currentTitle: title,
                currentMessage: message,
            });
            setTitle(result.titleSuggestions[0] || '');
            setMessage(result.descriptionSuggestions[0] || '');
            toast({ title: "AI copy generated!", description: "The title and body have been updated." });
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: "AI Error", description: "Failed to generate copy." });
        } finally {
            setIsGenerating(false);
        }
    };
    
    const validateForm = () => {
        const newErrors: { title?: string, primaryLink?: string } = {};
        if (!title.trim()) {
            newErrors.title = 'Empty title: Please enter a Title';
        }
        
        if (!primaryLink.trim()) {
            newErrors.primaryLink = 'Empty link: Please enter a URL';
        } else if (!isValidUrl(primaryLink)) {
            newErrors.primaryLink = 'Enter a valid primary link';
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    return (
        <div className="h-screen w-full grid grid-cols-1 lg:grid-cols-[minmax(0,_480px)_1fr]">
            {/* Left Panel: Creator */}
            <div className="bg-card border-r flex flex-col h-screen">
                {/* Header (fixed) */}
                <div className="p-4 border-b flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" asChild>
                            <Link href="/campaigns">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <h2 className="text-lg font-semibold">Campaign Creator</h2>
                    </div>
                    {saveStatus === 'Saving...' ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Saving...</span>
                        </p>
                    ) : saveStatus === 'Changes saved' ? (
                        <p className="text-sm text-green-600 flex items-center gap-2">
                            <Check className="h-4 w-4" />
                            <span>Changes saved</span>
                        </p>
                    ) : (
                         <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Check className="h-4 w-4 opacity-0" />
                            <span>Draft</span>
                        </p>
                    )}
                </div>

                {/* Scrollable content area */}
                <ScrollArea type="always" className="flex-grow campaign-creator-scroll-area">
                    <div className="space-y-6">
                        <ContentEditor 
                            title={title} setTitle={setTitle}
                            message={message} setMessage={setMessage}
                            primaryLink={primaryLink} setPrimaryLink={setPrimaryLink}
                            handleGenerateCopy={handleGenerateCopy}
                            handleTitleEmojiSelect={handleTitleEmojiSelect}
                            handleMessageEmojiSelect={handleMessageEmojiSelect}
                            isGenerating={isGenerating}
                            errors={errors}
                        />
                        
                        <RichMediaEditor
                            windowsHero={windowsHero} setWindowsHero={(v) => { setWindowsHero(v); if (!v.file) setShowWindowsWarning(false); }}
                            macHero={macHero} setMacHero={(v) => { setMacHero(v); if (!v.file) setShowMacWarning(false); }}
                            androidHero={androidHero} setAndroidHero={(v) => { setAndroidHero(v); if (!v.file) setShowAndroidWarning(false); }}
                            showWindowsWarning={showWindowsWarning}
                            showMacWarning={showMacWarning}
                            showAndroidWarning={showAndroidWarning}
                            handleImageUpload={handleImageUpload}
                            setEditingState={setEditingState}
                        />

                        <ActionButtonsEditor
                            actionButtons={actionButtons}
                            setActionButtons={setActionButtons}
                        />

                        <LogoUploaderEditor 
                            logo={logo}
                            setLogo={setLogo}
                            handleImageUpload={handleImageUpload}
                            setEditingState={setEditingState}
                        />
                    </div>
                </ScrollArea>
            </div>

            {/* Right Panel: Previews */}
            <div className="h-screen bg-background flex flex-col">
                <div className="flex-grow overflow-y-auto">
                    <div className="grid min-h-full grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-px bg-slate-300/80 dark:bg-slate-700">
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                            <AndroidPreview
                                title={title}
                                message={message}
                                link={primaryLink}
                                icon={logo.preview}
                                hero={androidHero.preview}
                                actionButtons={actionButtons}
                            />
                        </div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                            <WindowsPreview
                                title={title}
                                message={message}
                                link={primaryLink}
                                hero={windowsHero.preview}
                                actionButtons={actionButtons}
                            />
                        </div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                           <MacOSPreview
                                title={title}
                                message={message}
                                link={primaryLink}
                                icon={logo.preview}
                                hero={macHero.preview}
                                actionButtons={actionButtons}
                            />
                        </div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto">
                            <IOSPreview
                                title={title}
                                message={message}
                                link={primaryLink}
                                icon={logo.preview}
                            />
                        </div>
                    </div>
                </div>
                <div className="shrink-0 p-4 border-t bg-card flex justify-end items-center">
                    <ComposerActions
                        title={title}
                        primaryLink={primaryLink}
                        message={message}
                        logo={logo}
                        macHero={macHero}
                        onContinueClick={validateForm}
                    />
                </div>
            </div>

            <ImageEditorSheet 
                editingState={editingState} 
                setEditingState={setEditingState} 
                onSave={handleSaveCrop}
            />
        </div>
    )
}
