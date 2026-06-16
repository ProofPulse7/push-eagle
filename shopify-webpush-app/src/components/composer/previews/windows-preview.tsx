
'use client';

import { Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/settings-context';
import { BROWSER_LOGOS } from '@/lib/client/preview-assets';
import { formatStoreDisplayName } from '@/lib/client/merchant-website-url';

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
    const storeDisplayName = formatStoreDisplayName(storeUrl || link);
    const messageForDisplay = message ? (message.length > 100 ? `${message.substring(0, 100)}...` : message) : 'Your message will appear here...';
    
    return (
        <div className="w-full font-sans">
            {showDeviceName && <p className="text-center text-sm font-medium mb-4">Windows</p>}
            <div className="mx-auto w-[360px] max-w-full rounded-md border border-gray-700/50 bg-[#2d2d2d] text-white shadow-2xl">
                <div className="p-3">
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <img src={BROWSER_LOGOS.edge} alt="Microsoft Edge" className="h-4 w-4 shrink-0 object-contain" />
                            <span className="truncate text-sm">Microsoft Edge • {storeDisplayName}</span>
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
                        {icon ? <img src={icon} alt="logo" className="h-8 w-8 rounded-md object-cover" /> : null}
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
