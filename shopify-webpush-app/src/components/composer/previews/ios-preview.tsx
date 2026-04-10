
'use client';

import { ImageIcon } from 'lucide-react';
import { useSettings } from '@/context/settings-context';

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
        <div className="font-sans">
            {showDeviceName && <p className="text-center text-sm font-medium mb-4">iOS</p>}
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-3 border shadow-lg max-w-sm mx-auto">
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
                        <p className="text-black text-[15px] leading-snug" style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
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
