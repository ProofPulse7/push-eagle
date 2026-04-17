
'use client';

import type React from 'react';
import { Settings2, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/settings-context';

const WindowsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M11.378 2.003L2.003 3.32v8.058h9.375V2.003m0 9.375H2.003v8.058l9.375 1.317V11.378m1.244-.001v9.375l9.375-1.317V11.377h-9.375m0-9.375v8.058h9.375V3.32l-9.375-1.317z" />
    </svg>
);

const EdgeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M20 14.5c0 4.2-3.6 7.5-8 7.5s-8-3.3-8-7.5c0-4.4 3.6-8 8-8 2.2 0 4.2.9 5.6 2.4-1.1-.5-2.3-.8-3.6-.8-3.8 0-6.9 2.7-6.9 6 0 2.3 1.6 4.4 3.9 5.4-1.4-1-2.2-2.3-2.2-3.8 0-3 2.9-5.4 6.5-5.4 2.1 0 4 .8 5.3 2.1.3.6.4 1.3.4 2.1z" fill="#0ea5e9"/>
        <path d="M20 14.5c0 4.2-3.6 7.5-8 7.5 4.6 0 8.3-2.9 8.9-6.8-.9.8-2.1 1.3-3.5 1.3-2.5 0-4.5-1.6-4.5-3.6 0-.8.3-1.5.9-2.1 2.2.2 4.1 1.2 5.4 2.8.5.3.8.6.8.9z" fill="#0369a1"/>
    </svg>
);

type WindowsPreviewProps = {
  title: string;
  message: string;
  link: string;
  icon?: string | null;
  hero: string | null;
  actionButtons: { title: string; link: string }[];
  showDeviceName?: boolean;
};


export const WindowsPreview = ({ title, message, link, icon, hero, actionButtons, showDeviceName = true }: WindowsPreviewProps) => {
    const { storeUrl } = useSettings();
    const messageForDisplay = message ? (message.length > 100 ? `${message.substring(0, 100)}...` : message) : 'Your message will appear here...';
    
    return (
        <div className="w-full font-sans">
            {showDeviceName && <p className="text-center text-sm font-medium mb-4">Windows</p>}
            <div className="mx-auto w-[360px] max-w-full rounded-md border border-gray-700/50 bg-[#2d2d2d] text-white shadow-2xl">
                <div className="p-3">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <EdgeIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate text-sm">Microsoft Edge • {storeUrl}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Settings2 className="w-4 h-4 text-gray-400" />
                            <X className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                        <div className="flex-1 space-y-1">
                        <p className="font-semibold truncate">{title || 'Your Title Here'}</p>
                        <p className="min-h-[40px] text-sm text-gray-300" style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>{messageForDisplay}</p>
                        </div>
                        {icon ? <img src={icon} alt="logo" className="h-8 w-8 rounded-md object-cover" /> : <WindowsIcon className="h-7 w-7 shrink-0 text-gray-200" />}
                    </div>
                </div>
                
                {hero && (
                    <div className="relative aspect-[728/360] bg-[#404040]">
                        <img
                            src={hero}
                            alt="Campaign Hero"
                            className="absolute inset-0 w-full h-full object-contain"
                        />
                    </div>
                )}
                
                {actionButtons.length > 0 && (
                     <div className="flex bg-[#3b3b3b] rounded-bl-md rounded-br-md overflow-hidden">
                        <div className="flex-1 text-center">
                            {actionButtons[0] && (
                                <Button variant="ghost" className="w-full text-center text-sm py-2 bg-[#4a4a4a] hover:bg-[#5a5a5a] text-white transition-colors rounded-none h-auto">
                                    {actionButtons[0].title || `Button 1`}
                                </Button>
                            )}
                        </div>
                        {actionButtons.length > 1 && (
                            <>
                                <div className="w-px bg-gray-500"></div>
                                <div className="flex-1 text-center">
                                    <Button variant="ghost" className="w-full text-center text-sm py-2 bg-[#4a4a4a] hover:bg-[#5a5a5a] text-white transition-colors rounded-none h-auto">
                                        {actionButtons[1].title || `Button 2`}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
