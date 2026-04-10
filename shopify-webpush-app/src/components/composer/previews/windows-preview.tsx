
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

type WindowsPreviewProps = {
  title: string;
  message: string;
  link: string;
  hero: string | null;
  actionButtons: { title: string; link: string }[];
  showDeviceName?: boolean;
};


export const WindowsPreview = ({ title, message, link, hero, actionButtons, showDeviceName = true }: WindowsPreviewProps) => {
    const { storeUrl } = useSettings();
    const messageForDisplay = message ? (message.length > 100 ? `${message.substring(0, 100)}...` : message) : 'Your message will appear here...';
    
    return (
        <div className="w-full max-w-sm mx-auto font-sans">
            {showDeviceName && <p className="text-center text-sm font-medium mb-4">Windows</p>}
            <div className="bg-[#2d2d2d] text-white rounded-md shadow-2xl border border-gray-700/50">
                <div className="p-3">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                            <WindowsIcon className="w-4 h-4" />
                            <span className="text-sm">{storeUrl} via Microsoft Edge</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <Settings2 className="w-4 h-4 text-gray-400" />
                            <X className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="font-semibold truncate">{title || 'Your Title Here'}</p>
                        <p className="text-sm text-gray-300" style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>{messageForDisplay}</p>
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
