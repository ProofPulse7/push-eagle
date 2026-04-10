
'use client';

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DelaySelector } from "./delay-selector";
import { InlineNotificationPreview } from './inline-notification-preview';
import { cn } from '@/lib/utils';

export type NotificationStep = {
    id: string;
    title: string;
    delay: string;
    status: 'Active' | 'Inactive';
    notification: {
        title: string;
        message: string;
        iconUrl: string;
        heroUrl?: string | null;
        siteName: string;
        actionButtons?: { title: string; link: string }[];
    };
};

export const FlowNotificationCard = ({ 
    step, 
    previewDevice,
    onStatusChange,
    automationName
}: { 
    step: NotificationStep, 
    previewDevice: string,
    onStatusChange: (id: string, checked: boolean) => void,
    automationName: string
}) => {
    return (
        <Card className={cn("border-l-4", step.status === 'Active' ? "border-l-primary" : "border-l-border")}>
            <CardHeader className="p-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                         <div className="transform scale-75">
                            <Switch 
                                id={`status-toggle-${step.id}`}
                                checked={step.status === 'Active'}
                                onCheckedChange={(checked) => onStatusChange(step.id, !!checked)}
                                aria-label={`Toggle status for ${step.title}`}
                            />
                        </div>
                        <CardTitle className="text-xs font-semibold">{step.title}</CardTitle>
                        <Badge variant={step.status === 'Active' ? 'default' : 'secondary'}>{step.status}</Badge>
                    </div>
                    <DelaySelector currentDelay={step.delay} />
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <InlineNotificationPreview notification={step.notification} device={previewDevice} />
            </CardContent>
            <CardFooter className="p-2">
                 <Button variant="default" size="sm" className="w-full" asChild>
                    <Link href={`/automations/${automationName}/${step.id}/edit`}>
                        Edit automation
                    </Link>
                 </Button>
            </CardFooter>
        </Card>
    )
}
