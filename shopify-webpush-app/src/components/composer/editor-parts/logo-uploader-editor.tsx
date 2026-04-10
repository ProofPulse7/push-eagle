
'use client';

import { useRef } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Crop, Trash2, ImageIcon } from "lucide-react";

type ImageValue = { file: File | null; preview: string | null };

export const LogoUploaderEditor = ({
    logo,
    setLogo,
    handleImageUpload,
    setEditingState,
}: {
    logo: ImageValue;
    setLogo: (val: ImageValue) => void;
    handleImageUpload: (file: File | undefined, imageType: 'windows' | 'mac' | 'android' | 'logo') => void;
    setEditingState: (state: { url: string, aspect: number, type: string } | null) => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-2 pt-4 p-4">
            <Label>Logo</Label>
            <div className="flex items-center justify-between rounded-md border p-2 pl-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted/50 rounded-md flex items-center justify-center relative overflow-hidden shrink-0">
                        {logo.preview ? <img src={logo.preview} alt="Logo" className="w-full h-full object-contain" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <p className="font-medium text-sm">Company Logo</p>
                </div>
                 <div className="flex items-center">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild><Button size="icon" variant="ghost" onClick={() => logo.preview && setEditingState({ url: logo.preview, aspect: 1, type: 'logo' })} disabled={!logo.preview}><Crop className="h-4 w-4" /></Button></TooltipTrigger>
                            <TooltipContent>Edit Logo</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                             <TooltipTrigger asChild><Button size="icon" variant="ghost" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" /></Button></TooltipTrigger>
                            <TooltipContent>Upload Logo</TooltipContent>
                        </Tooltip>
                        {logo.preview && (
                            <Tooltip>
                                <TooltipTrigger asChild><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setLogo({ file: null, preview: null })}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger>
                                <TooltipContent>Remove Logo</TooltipContent>
                            </Tooltip>
                        )}
                    </TooltipProvider>
                </div>
            </div>
            <Input ref={inputRef} type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(e.target.files?.[0], 'logo')} />
        </div>
    );
};
