
'use client';

import type React from 'react';
import { ChevronUp, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/settings-context';

const ChromeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 22c-2.39 0-4.594-.848-6.273-2.273"/><path d="M22 12c0-2.39-.848-4.594-2.273-6.273"/><path d="M2 12c0 2.39.848-4.594 2.273 6.273"/><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5z"/><path d="m13.5 9.5 5.5-5.5"/><path d="m14 14-.5 2"/><path d="m10 14-.5 2"/><path d="m10 14 .5-2"/><path d="m13.5 9.5-5 .5"/><path d="m9.5 13.5 5-5.5"/></svg>
);

type AndroidPreviewProps = {
  title: string;
  message: string;
  link: string;
  icon: string | null;
  hero: string | null;
  actionButtons: { title: string; link: string }[];
  showDeviceName?: boolean;
};


export const AndroidPreview = ({ title, message, link, icon, hero, actionButtons, showDeviceName = true }: AndroidPreviewProps) => {
    const { storeUrl } = useSettings();
    const messageForDisplay = message ? (message.length > 100 ? `${message.substring(0, 100)}...` : message) : 'Your message will appear here...';
    
    return (
        <div className="w-full font-sans">
            {showDeviceName && <p className="text-center text-sm font-medium mb-4">Android</p>}
            <div className="mx-auto w-[360px] max-w-full rounded-2xl border border-neutral-300 bg-white p-1 shadow-2xl shadow-neutral-300/80">
                <div className="bg-white rounded-[14px] p-3 space-y-2">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                            <ChromeIcon className="w-4 h-4 text-gray-600"/>
                            <span className="text-xs text-gray-500">Chrome on Android • now</span>
                        </div>
                         <ChevronUp className="h-4 w-4 text-gray-500" />
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="flex-grow overflow-hidden">
                            <p className="font-bold text-black truncate">{title || 'Your Title Here'}</p>
                            <p className="text-sm text-gray-600" style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}>{messageForDisplay}</p>
                        </div>
                        {icon && <img src={icon} alt="logo" className="w-10 h-10 rounded-full flex-shrink-0" />}
                    </div>
                    
                    <div className="mt-2 overflow-hidden rounded-lg">
                        {hero && (
                            <div className="relative aspect-[3/1] bg-white">
                                <img src={hero} alt="Campaign Hero" className="absolute inset-0 w-full h-full object-contain" />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center pt-2">
                        {actionButtons.length > 0 ? (
                            <div className="flex justify-between w-full">
                                <div className="flex items-center gap-2">
                                    {actionButtons.map((button, index) => (
                                        <Button key={index} variant="link" className="text-blue-600 font-bold uppercase text-xs p-0 h-auto">
                                           {button.title || 'Action'}
                                        </Button>
                                    ))}
                                </div>
                                <Button variant="link" className="text-blue-600 font-bold uppercase text-xs p-0 h-auto">
                                   Site Settings
                                </Button>
                            </div>
                        ) : (
                            <div className="w-full flex justify-center">
                                 <Button variant="link" className="text-blue-600 font-bold uppercase text-xs p-0 h-auto">
                                   Site Settings
                                 </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
