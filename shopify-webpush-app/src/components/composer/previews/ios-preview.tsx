
'use client';

import type React from 'react';
import { ImageIcon } from 'lucide-react';
import { useSettings } from '@/context/settings-context';

const SafariIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <circle cx="12" cy="12" r="10" fill="#e2f2ff" />
        <circle cx="12" cy="12" r="8" fill="#38bdf8" />
        <path d="M12 5.5l2.2 4.8 4.8 2.2-4.8 2.2-2.2 4.8-2.2-4.8-4.8-2.2 4.8-2.2L12 5.5z" fill="#fff" />
    </svg>
);

type IOSPreviewProps = {
  title: string;
  message: string;
  link: string;
  icon: string | null;
  showDeviceName?: boolean;
};

export const IOSPreview = ({ title, message, link, icon, showDeviceName = true }: IOSPreviewProps) => {
    const { storeUrl } = useSettings();
    const messageForDisplay = message ? (message.length > 100 ? `${message.substring(0, 100)}...` : message) : 'Your message will appear here...';

    return (
        <div className="w-full font-sans">
            {showDeviceName && <p className="text-center text-sm font-medium mb-4">iOS</p>}
            <div className="mx-auto w-[360px] max-w-full rounded-2xl border bg-white/85 p-3 shadow-lg backdrop-blur-xl">
                <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                    <SafariIcon className="h-4 w-4" />
                    <span>Safari</span>
                </div>
                <div className="flex items-start gap-3">
                     <div className="w-12 h-12 bg-gray-200 rounded-lg flex-shrink-0 mt-1 overflow-hidden">
                        {icon ? <img src={icon} alt="logo" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-400 m-auto" />}
                    </div>
                    <div className="flex-grow overflow-hidden">
                        <div className="flex justify-between items-center">
                            <p className="text-[13px] font-semibold text-gray-500 truncate">{storeUrl}</p>
                            <p className="text-[12px] text-gray-400 flex-shrink-0 ml-2">now</p>
                        </div>
                        <p className="font-bold text-black truncate">{title || 'Your Title Here'}</p>
                        <p className="min-h-[42px] text-[15px] leading-snug text-black" style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {messageForDisplay}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
