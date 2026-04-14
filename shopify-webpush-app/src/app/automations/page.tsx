
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArchiveRestore,
    ArrowRight,
    Eye,
    Hand,
    ShoppingCart,
    Tag,
    Truck,
    type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

type RuleKey =
    | 'welcome_subscriber'
    | 'browse_abandonment_15m'
    | 'cart_abandonment_30m'
    | 'checkout_abandonment_30m'
    | 'shipping_notifications'
    | 'back_in_stock'
    | 'price_drop'
    | 'win_back_7d'
    | 'post_purchase_followup';

type AutomationRule = {
    id: string;
    ruleKey: RuleKey;
    enabled: boolean;
    config: Record<string, unknown>;
    updatedAt?: string | null;
};

type AutomationDefinition = {
    title: string;
    description: string;
    href: string;
    icon: LucideIcon;
    category: string;
};

const automationDefinitions: Record<RuleKey, AutomationDefinition> = {
    welcome_subscriber: {
        title: 'Welcome notifications',
        description: 'Sent right after a shopper subscribes to notifications.',
        href: '/automations/welcome-notifications',
        icon: Hand,
        category: 'Subscriber lifecycle',
    },
    browse_abandonment_15m: {
        title: 'Browse abandonment',
        description: 'Targets shoppers who viewed a product and did not continue their journey.',
        href: '/automations/browse-abandonment',
        icon: Eye,
        category: 'Purchase recovery',
    },
    cart_abandonment_30m: {
        title: 'Abandoned cart recovery',
        description: 'Reminds subscribers about products left in the cart.',
        href: '/automations/abandoned-cart-recovery',
        icon: ShoppingCart,
        category: 'Purchase recovery',
    },
    checkout_abandonment_30m: {
        title: 'Checkout abandonment',
        description: 'Catches shoppers who started checkout but never completed the order.',
        href: '/automations/abandoned-cart-recovery',
        icon: ShoppingCart,
        category: 'Purchase recovery',
    },
    shipping_notifications: {
        title: 'Shipping notifications',
        description: 'Pushes fulfillment updates such as in transit, out for delivery, and delivered.',
        href: '/automations/shipping-notifications',
        icon: Truck,
        category: 'Order lifecycle',
    },
    back_in_stock: {
        title: 'Back in stock',
        description: 'Sends an alert when an out-of-stock product becomes available again.',
        href: '/automations/back-in-stock',
        icon: ArchiveRestore,
        category: 'Merchandising',
    },
    price_drop: {
        title: 'Price drop',
        description: 'Notifies interested shoppers when product pricing decreases.',
        href: '/automations/price-drop',
        icon: Tag,
        category: 'Merchandising',
    },
    win_back_7d: {
        title: 'Win-back',
        description: 'Re-engages recent buyers after their last order goes quiet.',
        href: '/automations/win-back',
        icon: Hand,
        category: 'Subscriber lifecycle',
    },
    post_purchase_followup: {
        title: 'Post-purchase follow-up',
        description: 'Follows up after a completed order to bring shoppers back.',
        href: '/automations/post-purchase-follow-up',
        icon: Hand,
        category: 'Order lifecycle',
    },
};

const formatUpdatedAt = (value?: string | null) => {
    if (!value) {
        return 'Not updated yet';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Not updated yet';
    }

    return date.toLocaleString();
};

export default function AutomationsPage() {
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingRuleKey, setSavingRuleKey] = useState<RuleKey | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const loadRules = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch('/api/automations/rules', { cache: 'no-store' });
                const payload = (await response.json()) as { ok?: boolean; error?: string; rules?: AutomationRule[] };

                if (!response.ok || !payload.ok) {
                    throw new Error(payload.error || 'Failed to load automation rules.');
                }

                if (!cancelled) {
                    setRules(payload.rules || []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load automation rules.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadRules();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleToggleStatus = async (rule: AutomationRule) => {
        try {
            setSavingRuleKey(rule.ruleKey);
            setError(null);

            const response = await fetch('/api/automations/rules', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ruleKey: rule.ruleKey,
                    enabled: !rule.enabled,
                    config: rule.config || {},
                }),
            });

            const payload = (await response.json()) as { ok?: boolean; error?: string; rule?: AutomationRule };
            if (!response.ok || !payload.ok || !payload.rule) {
                throw new Error(payload.error || 'Failed to update automation rule.');
            }

            setRules((current) => current.map((item) => (item.ruleKey === payload.rule?.ruleKey ? payload.rule : item)));
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to update automation rule.');
        } finally {
            setSavingRuleKey(null);
        }
    };

    const enabledCount = rules.filter((rule) => rule.enabled).length;
    const totalCount = rules.length;
    const eventDrivenCount = rules.filter((rule) => ['shipping_notifications', 'back_in_stock', 'price_drop', 'post_purchase_followup'].includes(rule.ruleKey)).length;

    return (
        <div className="flex flex-col gap-8 p-4 sm:p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Automations</h1>
                    <p className="text-muted-foreground">Live rules backed by Shopify webhooks, storefront activity, and order events.</p>
                </div>
            </div>

            <Card>
                <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
                    {loading ? (
                        <>
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </>
                    ) : (
                        <>
                            <div>
                                <p className="text-sm text-muted-foreground">Total automations</p>
                                <p className="text-3xl font-semibold">{totalCount}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Enabled now</p>
                                <p className="text-3xl font-semibold">{enabledCount}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Webhook-driven flows</p>
                                <p className="text-3xl font-semibold">{eventDrivenCount}</p>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {error ? (
                <Card>
                    <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
                </Card>
            ) : null}

            <div>
                <h2 className="mb-4 text-xl font-semibold tracking-tight">All automations</h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {loading
                        ? Array.from({ length: 9 }).map((_, index) => <Skeleton key={index} className="h-[240px] w-full" />)
                        : rules.map((rule) => {
                                const definition = automationDefinitions[rule.ruleKey];
                                const Icon = definition.icon;

                                return (
                                    <Card key={rule.id}>
                                        <CardHeader>
                                            <div className="flex items-start gap-4">
                                                <div className="rounded-lg bg-muted p-3">
                                                    <Icon className="h-6 w-6 text-primary" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <CardTitle>{definition.title}</CardTitle>
                                                        <Badge variant={rule.enabled ? 'default' : 'secondary'}>{rule.enabled ? 'Active' : 'Inactive'}</Badge>
                                                    </div>
                                                    <CardDescription className="mt-1">{definition.description}</CardDescription>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                                            <div className="flex items-center justify-between gap-3">
                                                <span>Category</span>
                                                <span className="text-right font-medium text-foreground">{definition.category}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <span>Last updated</span>
                                                <span className="text-right font-medium text-foreground">{formatUpdatedAt(rule.updatedAt)}</span>
                                            </div>
                                        </CardContent>
                                        <Separator />
                                        <CardFooter className="flex items-center justify-between gap-3 px-6 py-4">
                                            <Button
                                                size="sm"
                                                variant={rule.enabled ? 'destructive' : 'default'}
                                                onClick={() => handleToggleStatus(rule)}
                                                disabled={savingRuleKey === rule.ruleKey}
                                            >
                                                {savingRuleKey === rule.ruleKey ? 'Saving...' : rule.enabled ? 'Deactivate' : 'Activate'}
                                            </Button>
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={definition.href}>
                                                    View flow <ArrowRight className="ml-2 h-4 w-4" />
                                                </Link>
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                );
                            })}
                </div>
            </div>
        </div>
    );
}
