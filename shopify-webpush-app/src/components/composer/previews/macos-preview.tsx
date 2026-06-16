
'use client';

import React, { useState } from 'react';
import { MoreHorizontal, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/settings-context';
import { BROWSER_LOGOS } from '@/lib/client/preview-assets';
import { formatStoreDisplayName } from '@/lib/client/merchant-website-url';

type MacOSPreviewProps = {
  title: string;
  message: string;
  link: string;
  icon: string | null;
  hero: string | null;
  actionButtons: { title: string; link: string }[];
  showDeviceName?: boolean;
};


export const MacOSPreview = ({ title, message, link, icon, hero, actionButtons, showDeviceName = true }: MacOSPreviewProps) => {
    const { storeUrl } = useSettings();
    const storeDisplayName = formatStoreDisplayName(storeUrl || link);
    const [isExpanded, setIsExpanded] = useState(false);
    const messageForDisplay = message ? (message.length > 100 ? `${message.substring(0, 100)}...` : message) : 'Your message will appear here...';
    
    return (
        <div className="w-full font-sans">
             {showDeviceName && (
                <div className="flex justify-between items-center mb-2">
                    <p className="text-left text-sm font-medium">macOS</p>
                    <div className="flex gap-2">
                        <div className="h-8 px-3 flex items-center justify-center text-xs bg-white/80 border rounded-md shadow-sm">Big Sur and newer</div>
                        <div className="h-8 px-3 flex items-center justify-center gap-1 text-xs bg-white/80 border rounded-md shadow-sm">
                            <img src={BROWSER_LOGOS.chrome} alt="Chrome" className="h-3.5 w-3.5 object-contain" />
                            Chrome
                        </div>
                    </div>
                </div>
            )}
            {!isExpanded ? (
                <div onClick={() => setIsExpanded(true)} className="mx-auto w-[360px] max-w-full cursor-pointer rounded-xl border border-gray-200 bg-white/90 p-3 pb-6 shadow-lg backdrop-blur-xl">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                            <img src={BROWSER_LOGOS.chrome} alt="Chrome" className="h-4 w-4 object-contain" />
                            <p className="text-xs font-semibold text-gray-500">GOOGLE CHROME</p>
                        </div>
                        <p className="text-xs text-gray-400">1m ago</p>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="flex-grow overflow-hidden">
                            <p className="font-semibold text-black truncate">{title || 'Your Title Here'}</p>
                            <p className="text-xs text-black">{storeDisplayName}</p>
                            <p className="text-sm text-gray-600 mt-1" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {messageForDisplay}
                            </p>
                        </div>
                        {hero && (
                            <div className="w-10 h-10 bg-gray-200 rounded-md flex-shrink-0 overflow-hidden">
                               <img src={hero} alt="macOS hero thumbnail" className="w-full h-full object-cover" />
                            </div>
                        )}
                    </div>
                 </div>
            ) : (
                 <div className="mx-auto w-[360px] max-w-full rounded-xl border border-gray-300/80 bg-[#f0f0f0] shadow-lg">
                    <div className="p-2 border-b border-gray-300/80 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <img src={BROWSER_LOGOS.chrome} alt="Chrome" className="h-4 w-4 object-contain" />
                            <p className="text-xs font-semibold">GOOGLE CHROME</p>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsExpanded(false)}>
                            <MoreHorizontal className="w-4 h-4 text-gray-500" />
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                        </div>
                    </div>
                    <div className="p-3 pt-0">
                         <div className="relative mt-3 mb-3">
                            {hero && (
                                <div className="aspect-[704/512] bg-[#e0e0e0] rounded-lg overflow-hidden relative">
                                    <img src={hero} alt="Campaign Hero" className="w-full h-full object-contain" />
                                </div>
                            )}
                         </div>

                        <div className="mt-2">
                            <p className="font-bold text-black">{title || 'Your Title Here'}</p>
                            <p className="text-sm text-black">{storeDisplayName}</p>
                            <p className="text-sm text-gray-700 mt-1">
                                {messageForDisplay}
                            </p>
                        </div>
                    </div>
                    <div className="border-t border-gray-300/80 flex flex-col bg-white/50 rounded-b-xl">
                        <div className="w-full text-center text-blue-500 font-medium py-2.5 border-b border-gray-300/80 last:border-b-0 cursor-pointer hover:bg-black/5 transition-colors">
                            More
                        </div>
                        {actionButtons.map((button, index) => (
                             <div key={index} className="w-full text-center text-blue-500 font-medium py-2.5 border-b border-gray-300/80 last:border-b-0 cursor-pointer hover:bg-black/5 transition-colors">
                                {button.title || 'Action'}
                            </div>
                        ))}
                        <div className="w-full text-center text-blue-500 font-medium py-2.5 border-b border-gray-300/80 last:border-b-0 cursor-pointer hover:bg-black/5 transition-colors">
                            Settings
                        </div>
                    </div>
                </div>
            )}
            {!isExpanded && showDeviceName && (
                <div className="mt-2 flex justify-center">
                    <Button variant="link" size="sm" onClick={() => setIsExpanded(true)} className="text-sm text-muted-foreground hover:text-primary">
                        Expand notification
                    </Button>
                </div>
            )}
        </div>
    );
};
