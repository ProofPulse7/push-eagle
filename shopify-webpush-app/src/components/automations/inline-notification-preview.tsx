
'use client';

import { AndroidPreview } from '@/components/composer/previews/android-preview';
import { WindowsPreview } from '@/components/composer/previews/windows-preview';
import { MacOSPreview } from '@/components/composer/previews/macos-preview';
import { IOSPreview } from '@/components/composer/previews/ios-preview';
import { useSettings } from '@/context/settings-context';

type Notification = {
    title: string;
    message: string;
    iconUrl?: string | null;
    heroUrl?: string | null;
    windowsImageUrl?: string | null;
    macosImageUrl?: string | null;
    androidImageUrl?: string | null;
    siteName: string;
    actionButtons?: { title: string; link: string }[];
};

export function InlineNotificationPreview({ notification, device }: { notification: Notification, device: string }) {
    const { title, message, iconUrl, heroUrl, windowsImageUrl, macosImageUrl, androidImageUrl, actionButtons } = notification;
    const { storeUrl, logo } = useSettings();
    const effectiveIcon = iconUrl || logo.preview || null;
    const effectiveHero = device === 'windows'
        ? (windowsImageUrl || heroUrl || null)
        : device === 'macos'
            ? (macosImageUrl || heroUrl || null)
            : device === 'android'
                ? (androidImageUrl || heroUrl || null)
                : (heroUrl || null);

    const renderPreview = () => {
        switch (device) {
            case 'windows':
                return <WindowsPreview title={title} message={message} link={storeUrl} hero={effectiveHero} actionButtons={actionButtons || []} showDeviceName={false} />;
            case 'macos':
                 return <MacOSPreview title={title} message={message} link={storeUrl} icon={effectiveIcon} hero={effectiveHero} actionButtons={actionButtons || []} showDeviceName={false} />;
            case 'android':
                return <AndroidPreview title={title} message={message} link={storeUrl} icon={effectiveIcon} hero={effectiveHero} actionButtons={actionButtons || []} showDeviceName={false} />;
            case 'ios':
                return <IOSPreview title={title} message={message} link={storeUrl} icon={effectiveIcon} showDeviceName={false} />;
            default:
                return <AndroidPreview title={title} message={message} link={storeUrl} icon={effectiveIcon} hero={effectiveHero} actionButtons={actionButtons || []} showDeviceName={false} />;
        }
    };

    return (
        <div className="bg-muted/50 p-4">
             <div className="w-full max-w-sm mx-auto transition-all duration-300 ease-in-out">
                {renderPreview()}
            </div>
        </div>
    );
}
