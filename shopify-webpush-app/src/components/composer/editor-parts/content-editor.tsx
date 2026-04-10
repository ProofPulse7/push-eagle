
'use client';

import {
    Sparkles,
    Siren,
    Gift,
    Zap,
    Smile,
    Loader2,
    Info,
} from "lucide-react";
import TextareaAutosize from 'react-textarea-autosize';
import dynamic from 'next/dynamic';

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

const aiPrompts = [
    { icon: Siren, label: "Make it urgent" },
    { icon: Gift, label: "Holiday discount" },
    { icon: Zap, label: "Make it exciting" }
];

const TITLE_LIMIT = 44;
const MESSAGE_LIMIT = 100;

export const ContentEditor = ({
    title, setTitle,
    message, setMessage,
    primaryLink, setPrimaryLink,
    handleGenerateCopy,
    handleTitleEmojiSelect,
    handleMessageEmojiSelect,
    isGenerating,
    errors = {}
}: {
    title: string;
    setTitle: (title: string) => void;
    message: string;
    setMessage: (message: string) => void;
    primaryLink: string;
    setPrimaryLink: (link: string) => void;
    handleGenerateCopy?: (brandVoice?: string) => void;
    handleTitleEmojiSelect: (emoji: { emoji: string }) => void;
    handleMessageEmojiSelect: (emoji: { emoji: string }) => void;
    isGenerating?: boolean;
    errors: { title?: string, primaryLink?: string };
}) => {
    return (
        <div className="space-y-4 pt-2">
            {handleGenerateCopy && (
                <div className="p-4">
                    <h3 className="text-sm font-medium text-muted-foreground">AI ASSISTANT</h3>
                    <div className="space-y-2 pt-2">
                        <Button onClick={() => handleGenerateCopy()} className="w-full justify-start" disabled={isGenerating}>
                            {isGenerating ? <Loader2 className="mr-2 animate-spin" /> : <Sparkles className="mr-2" />}
                            {isGenerating ? 'Generating...' : 'Suggest Title & Message'}
                        </Button>
                        <div className="flex items-center gap-2">
                            {aiPrompts.map(prompt => (
                                <TooltipProvider key={prompt.label}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button variant="outline" size="icon" className="h-9 w-9 flex-1" onClick={() => handleGenerateCopy(prompt.label)} disabled={isGenerating}>
                                                <prompt.icon className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent><p>{prompt.label}</p></TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Input 
                            id="title" 
                            placeholder="Enter a catchy title" 
                            value={title} 
                            onChange={e => setTitle(e.target.value)} 
                            className={cn("pr-10", errors.title && "border-destructive")}
                        />
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
                    {errors.title && (
                        <p className="text-sm text-destructive flex items-center gap-1.5 pt-1">
                            <Info className="h-4 w-4" /> {errors.title}
                        </p>
                    )}
                    {title.length > TITLE_LIMIT && !errors.title && (
                        <p className="text-xs text-right text-yellow-600">
                            {title.length - TITLE_LIMIT} character{title.length - TITLE_LIMIT !== 1 ? 's' : ''} exceeded. Some text may not be visible in all notifications.
                        </p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="message">Message</Label>
                    <div className="relative">
                        <TextareaAutosize
                            id="message"
                            maxLength={MESSAGE_LIMIT + 50} // Allow overtyping to show warning
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
                    {message.length > MESSAGE_LIMIT && (
                        <p className="text-xs text-right text-yellow-600">
                            {message.length - MESSAGE_LIMIT} character{message.length - MESSAGE_LIMIT !== 1 ? 's' : ''} exceeded. Some text may not be visible in all notifications.
                        </p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="primaryLink">Destination URL <span className="text-destructive">*</span></Label>
                    <Input 
                        id="primaryLink" 
                        placeholder="Enter destination URL" 
                        value={primaryLink} 
                        onChange={e => setPrimaryLink(e.target.value)} 
                        className={cn(errors.primaryLink && "border-destructive")}
                    />
                    {errors.primaryLink && (
                        <p className="text-sm text-destructive flex items-center gap-1.5 pt-1">
                            <Info className="h-4 w-4" /> {errors.primaryLink}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
