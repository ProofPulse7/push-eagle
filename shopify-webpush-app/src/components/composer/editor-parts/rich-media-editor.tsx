
'use client';

import { useRef } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Crop, Trash2, Info } from "lucide-react";

type ImageValue = { file: File | null; preview: string | null };

const HeroImageUploader = ({ 
    title,
    dimensions,
    previewUrl,
    onUpload,
    onRemove,
    onEdit,
    showWarning,
}: { 
    title: string;
    dimensions: string;
    previewUrl: string | null;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
    onEdit: () => void;
    showWarning: boolean;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <Label className="font-medium">{title}</Label>
                <p className="text-sm text-muted-foreground">{dimensions}</p>
            </div>

            {!previewUrl ? (
                <Button variant="outline" size="sm" className="w-full justify-start font-normal" onClick={() => inputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4 text-muted-foreground" />
                    Upload image
                </Button>
            ) : (
                 <div className="flex items-center justify-between rounded-md border p-2 pl-3 gap-2">
                    <div className="aspect-[2/1] w-24 bg-muted/50 flex items-center justify-center rounded-sm shrink-0">
                       <img src={previewUrl} alt={title} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild><Button size="icon" variant="ghost" onClick={onEdit}><Crop className="h-4 w-4" /></Button></TooltipTrigger>
                                <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                 <TooltipTrigger asChild><Button size="icon" variant="ghost" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" /></Button></TooltipTrigger>
                                <TooltipContent>Upload New</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger>
                                <TooltipContent>Remove</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            )}
            
            {showWarning && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 p-2 rounded-md border border-yellow-500/20">
                    <Info className="h-3.5 w-3.5" />
                    <span>Incorrect image dimensions. Click <Crop className="inline h-3.5 w-3.5 mx-0.5"/> to crop for best results.</span>
                </div>
            )}
            <Input ref={inputRef} type="file" className="hidden" accept="image/*" onChange={onUpload} />
        </div>
    );
};

export const RichMediaEditor = ({
    windowsHero, setWindowsHero,
    macHero, setMacHero,
    androidHero, setAndroidHero,
    showWindowsWarning,
    showMacWarning,
    showAndroidWarning,
    handleImageUpload,
    setEditingState,
}: {
    windowsHero: ImageValue; setWindowsHero: (val: ImageValue) => void;
    macHero: ImageValue; setMacHero: (val: ImageValue) => void;
    androidHero: ImageValue; setAndroidHero: (val: ImageValue) => void;
    showWindowsWarning: boolean;
    showMacWarning: boolean;
    showAndroidWarning: boolean;
    handleImageUpload: (file: File | undefined, imageType: 'windows' | 'mac' | 'android' | 'logo') => void;
    setEditingState: (state: { url: string, aspect: number, type: string } | null) => void;
}) => {
    return (
        <div className="space-y-4 border-t pt-6 mt-4 p-4">
            <h3 className="text-base font-medium">Rich Media</h3>
            <div className="space-y-6">
                <HeroImageUploader title="Windows Hero" dimensions="728x360px" previewUrl={windowsHero.preview} showWarning={showWindowsWarning}
                    onUpload={e => handleImageUpload(e.target.files?.[0], 'windows')}
                    onRemove={() => setWindowsHero({ file: null, preview: null })}
                    onEdit={() => windowsHero.preview && setEditingState({ url: windowsHero.preview, aspect: 728 / 360, type: 'windows' })}
                />
                <HeroImageUploader title="macOS Hero" dimensions="704x512px" previewUrl={macHero.preview} showWarning={showMacWarning}
                    onUpload={e => handleImageUpload(e.target.files?.[0], 'mac')}
                    onRemove={() => setMacHero({ file: null, preview: null })}
                    onEdit={() => macHero.preview && setEditingState({ url: macHero.preview, aspect: 704 / 512, type: 'mac' })}
                />
                <HeroImageUploader title="Android Hero" dimensions="720x240px" previewUrl={androidHero.preview} showWarning={showAndroidWarning}
                    onUpload={e => handleImageUpload(e.target.files?.[0], 'android')}
                    onRemove={() => setAndroidHero({ file: null, preview: null })}
                    onEdit={() => androidHero.preview && setEditingState({ url: androidHero.preview, aspect: 720 / 240, type: 'android' })}
                />
            </div>
        </div>
    );
}
