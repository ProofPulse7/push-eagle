
'use client';
import { useState, useEffect } from 'react';
import { useAutomationState } from '@/context/automation-context';

import { IOSPreview } from '../composer/previews/ios-preview';
import { AndroidPreview } from '../composer/previews/android-preview';
import { WindowsPreview } from '../composer/previews/windows-preview';
import { MacOSPreview } from '../composer/previews/macos-preview';

import { ContentEditor } from '../composer/editor-parts/content-editor';
import { RichMediaEditor } from '../composer/editor-parts/rich-media-editor';
import { ActionButtonsEditor } from '../composer/editor-parts/action-buttons-editor';
import { LogoUploaderEditor } from '../composer/editor-parts/logo-uploader-editor';
import { ImageEditorSheet } from '../composer/editor-parts/image-editor-sheet';
import { ScrollArea } from '../ui/scroll-area';
import { AutomationComposerActions } from './automation-composer-actions';
import { Check, Loader2 } from 'lucide-react';

export function AutomationComposer({
    automationPath = '/automations/welcome-notifications',
    automationRuleKey = 'welcome_subscriber',
}: {
    automationPath?: string;
    automationRuleKey?: 'welcome_subscriber' | 'cart_abandonment_30m' | 'browse_abandonment_15m' | 'shipping_notifications' | 'back_in_stock' | 'price_drop';
}) {
    const { 
        title, setTitle, 
        message, setMessage, 
        primaryLink, setPrimaryLink,
        actionButtons, setActionButtons,
        windowsHero, setWindowsHero,
        macHero, setMacHero,
        androidHero, setAndroidHero,
        logo, setLogo,
    } = useAutomationState();
    
    const [showWindowsWarning, setShowWindowsWarning] = useState(false);
    const [showMacWarning, setShowMacWarning] = useState(false);
    const [showAndroidWarning, setShowAndroidWarning] = useState(false);
    const [editingState, setEditingState] = useState<{ url: string; aspect: number; type: string } | null>(null);
    const [saveStatus, setSaveStatus] = useState<'Unsaved' | 'Saving...' | 'Changes saved'>('Unsaved');
    
    const handleTitleEmojiSelect = (emoji: { emoji: string }) => setTitle(`${title}${emoji.emoji}`);
    const handleMessageEmojiSelect = (emoji: { emoji: string }) => setMessage(`${message}${emoji.emoji}`);

    const handleEditedImageSave = (dataUrl: string, type: string) => {
        if (type === 'windows') {
            setWindowsHero({ ...windowsHero, file: null, preview: dataUrl, originalPreview: windowsHero.originalPreview ?? windowsHero.preview });
            return;
        }
        if (type === 'mac') {
            setMacHero({ ...macHero, file: null, preview: dataUrl, originalPreview: macHero.originalPreview ?? macHero.preview });
            return;
        }
        if (type === 'android') {
            setAndroidHero({ ...androidHero, file: null, preview: dataUrl, originalPreview: androidHero.originalPreview ?? androidHero.preview });
            return;
        }
        if (type === 'logo') {
            setLogo({ file: null, preview: dataUrl });
        }
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
            const newImageValue = { file, preview: previewUrl, originalPreview: previewUrl };
            if (isFirstHeroUpload) {
                setWindowsHero({ ...newImageValue });
                setMacHero({ ...newImageValue });
                setAndroidHero({ ...newImageValue });
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

    const getAutomationData = () => ({
      title,
      message,
      primaryLink,
      logo,
            windowsHero,
      macHero,
            androidHero,
      actionButtons
    });

    return (
        <div className="h-screen w-full grid grid-cols-1 lg:grid-cols-[minmax(0,_480px)_1fr]">
            <div className="bg-card border-r flex flex-col h-screen">
                 <div className="p-4 border-b flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-semibold">Automation Editor</h2>
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
                            <span>Unsaved changes</span>
                        </p>
                    )}
                </div>

                <ScrollArea type="always" className="flex-grow campaign-creator-scroll-area">
                    <div className="p-4 space-y-6">
                        <ContentEditor 
                            title={title} setTitle={setTitle}
                            message={message} setMessage={setMessage}
                            primaryLink={primaryLink} setPrimaryLink={setPrimaryLink}
                            handleTitleEmojiSelect={handleTitleEmojiSelect}
                            handleMessageEmojiSelect={handleMessageEmojiSelect}
                            errors={{}}
                        />
                        <RichMediaEditor
                            windowsHero={windowsHero} setWindowsHero={setWindowsHero} showWindowsWarning={showWindowsWarning}
                            macHero={macHero} setMacHero={setMacHero} showMacWarning={showMacWarning}
                            androidHero={androidHero} setAndroidHero={setAndroidHero} showAndroidWarning={showAndroidWarning}
                            handleImageUpload={handleImageUpload} setEditingState={setEditingState}
                        />
                        <ActionButtonsEditor actionButtons={actionButtons} setActionButtons={setActionButtons} />
                        <LogoUploaderEditor logo={logo} setLogo={setLogo} handleImageUpload={handleImageUpload} setEditingState={setEditingState} />
                    </div>
                </ScrollArea>
            </div>

            <div className="h-screen bg-background flex flex-col">
                <div className="flex-grow overflow-y-auto">
                    <div className="grid min-h-full grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-px bg-slate-300/80 dark:bg-slate-700">
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto"><AndroidPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={androidHero.preview} actionButtons={actionButtons} /></div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto"><WindowsPreview title={title} message={message} link={primaryLink} hero={windowsHero.preview} actionButtons={actionButtons} /></div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto"><MacOSPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={macHero.preview} actionButtons={actionButtons} /></div>
                        <div className="bg-background p-4 flex items-center justify-center relative overflow-auto"><IOSPreview title={title} message={message} link={primaryLink} icon={logo.preview} /></div>
                    </div>
                </div>
                <div className="shrink-0 p-4 border-t bg-card flex justify-end items-center">
                    <AutomationComposerActions 
                        setSaveStatus={setSaveStatus}
                        getAutomationData={getAutomationData}
                        automationPath={automationPath}
                        automationRuleKey={automationRuleKey}
                    />
                </div>
            </div>

            <ImageEditorSheet editingState={editingState} setEditingState={setEditingState} onSave={handleEditedImageSave} />
        </div>
    )
}
