
'use client';

import React, { useState } from 'react';
import { MoreHorizontal, ChevronDown, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/settings-context';

const ChromeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
        <g fill="none" fillRule="evenodd">
            <path fill="#34A853" d="M21.5,12A9.5,9.5 0 0,1 2.5,12A9.5,9.5 0 0,1 21.5,12"/>
            <path fill="#4285F4" d="M21.5,12A9.5,9.5 0 0,1 12,2.5A9.5,9.5 0 0,1 21.5,12"/>
            <path fill="#EA4335" d="M12,2.5A9.5,9.5 0 0,1 2.5,12A9.5,9.5 0 0,1 12,2.5"/>
            <path fill="#FBBC05" d="M2.5,12A9.5,9.5 0 0,1 12,21.5A9.5,9.5 0 0,1 2.5,12"/>
            <path fill="#4285F4" d="M12,17A5,5 0 0,1 12,7A5,5 0 0,1 12,17"/>
            <path fill="#FFF" d="M12,16A4,4 0 0,1 12,8A4,4 0 0,1 12,16"/>
        </g>
    </svg>
);

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
    const [isExpanded, setIsExpanded] = useState(false);
    const messageForDisplay = message ? (message.length > 100 ? `${message.substring(0, 100)}...` : message) : 'Your message will appear here...';
    
    return (
        <div className="w-full max-w-sm mx-auto font-sans">
             {showDeviceName && (
                <div className="flex justify-between items-center mb-2">
                    <p className="text-left text-sm font-medium">macOS</p>
                    <div className="flex gap-2">
                        <div className="h-8 px-3 flex items-center justify-center text-xs bg-white/80 border rounded-md shadow-sm">Big Sur and newer</div>
                        <div className="h-8 px-3 flex items-center justify-center text-xs bg-white/80 border rounded-md shadow-sm">Chrome</div>
                    </div>
                </div>
            )}
            {!isExpanded ? (
                // Collapsed View
                <div onClick={() => setIsExpanded(true)} className="bg-white/90 backdrop-blur-xl rounded-xl shadow-lg border border-gray-200 p-3 pb-6 cursor-pointer">
                    <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                            <ChromeIcon className="w-4 h-4 text-gray-600"/>
                            <p className="text-xs font-semibold text-gray-500">GOOGLE CHROME</p>
                        </div>
                        <p className="text-xs text-gray-400">1m ago</p>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="flex-grow overflow-hidden">
                            <p className="font-semibold text-black truncate">{title || 'Your Title Here'}</p>
                            <p className="text-xs text-black">{storeUrl}</p>
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
                // Expanded View
                 <div className="bg-[#f0f0f0] rounded-xl shadow-lg border border-gray-300/80">
                    <div className="p-2 border-b border-gray-300/80 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <ChromeIcon className="w-4 h-4 text-gray-600"/>
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
                            <p className="text-sm text-black">{storeUrl}</p>
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
