
'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
    ArchiveRestore,
    ArrowRight,
    Calendar,
    Eye,
    Hand,
    ShoppingCart,
    Tag,
    Truck,
    type LucideIcon,
} from 'lucide-react';

import { useAutomationsOverview } from '@/hooks/queries/use-app-queries';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { normalizeAutomationRule, normalizeAutomationRules } from '@/lib/client/normalize-automation-rule';
import { queryKeys } from '@/lib/client/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { formatCurrency, formatNumber } from '@/lib/utils';

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
    impressions?: number;
    clicks?: number;
    revenueCents?: number;
};

type AutomationStats = {
    impressions: number;
    clicks: number;
    revenueCents: number;
};

type AutomationDefinition = {
    title: string;
    description: string;
    href: string;
    icon: LucideIcon;
    footerStatusText: string;
};

const automationDefinitions: Record<RuleKey, AutomationDefinition> = {
    welcome_subscriber: {
        title: 'Welcome notifications',
        description: 'A sequence of notifications sent to the subscriber once they subscribe to your store notifications.',
        href: '/automations/welcome-notifications',
        icon: Hand,
        footerStatusText: 'Activated.',
    },
    browse_abandonment_15m: {
        title: 'Browse abandonment',
        description: 'A sequence of notifications to remind customers if they view a product without adding it to cart.',
        href: '/automations/browse-abandonment',
        icon: Eye,
        footerStatusText: 'Inactive.',
    },
    cart_abandonment_30m: {
        title: 'Abandoned cart recovery',
        description: 'A sequence of notifications to remind the subscribers about the items they forgot in their cart.',
        href: '/automations/abandoned-cart-recovery',
        icon: ShoppingCart,
        footerStatusText: 'Inactive.',
    },
    checkout_abandonment_30m: {
        title: 'Checkout abandonment',
        description: 'A sequence of notifications for shoppers who started checkout but never completed it.',
        href: '/automations/abandoned-cart-recovery',
        icon: ShoppingCart,
        footerStatusText: 'Inactive.',
    },
    shipping_notifications: {
        title: 'Shipping notifications',
        description: 'A notification is sent to the subscriber as soon as the status of their fulfillment is updated.',
        href: '/automations/shipping-notifications',
        icon: Truck,
        footerStatusText: 'Inactive.',
    },
    back_in_stock: {
        title: 'Back in stock',
        description: 'A notification is sent to subscribers whenever an out-of-stock product is made available again.',
        href: '/automations/back-in-stock',
        icon: ArchiveRestore,
        footerStatusText: 'Inactive.',
    },
    price_drop: {
        title: 'Price drop',
        description: 'A notification is sent to the subscriber whenever the price of a product is dropped.',
        href: '/automations/price-drop',
        icon: Tag,
        footerStatusText: 'Inactive.',
    },
    win_back_7d: {
        title: 'Win-back',
        description: 'Re-engages recent buyers after their last order goes quiet.',
        href: '/automations/win-back',
        icon: Hand,
        footerStatusText: 'Inactive.',
    },
    post_purchase_followup: {
        title: 'Post-purchase follow-up',
        description: 'Follows up after a completed order to bring shoppers back.',
        href: '/automations/post-purchase-follow-up',
        icon: Hand,
        footerStatusText: 'Inactive.',
    },
};

const visibleRuleKeys: RuleKey[] = [
    'welcome_subscriber',
    'cart_abandonment_30m',
    'browse_abandonment_15m',
    'shipping_notifications',
    'back_in_stock',
    'price_drop',
];

const getStatusBadgeClassName = (enabled: boolean) =>
    enabled
        ? 'border border-violet-200 bg-violet-500/15 text-violet-700'
        : 'border border-slate-200 bg-slate-100 text-slate-600';

const getActionButtonClassName = (enabled: boolean) =>
    enabled
        ? 'h-8 rounded-lg bg-red-500 px-3 text-xs font-semibold text-white hover:bg-red-500/90'
        : 'h-8 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-600/90';

export default function AutomationsPage() {
    const activeShopDomain = useShopDomain();
    const { atLimit } = useImpressionLimit();
    const queryClient = useQueryClient();
    const { data, isLoading, isFetching, isError, error: queryError } = useAutomationsOverview();
    const [savingRuleKey, setSavingRuleKey] = useState<RuleKey | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { rules, stats } = useMemo(() => {
        const overviewRules = normalizeAutomationRules(data?.rules);
        const mergedRules = visibleRuleKeys.map((ruleKey) => {
            const found = overviewRules.find((rule) => rule.ruleKey === ruleKey);
            return (
                found ?? {
                    id: ruleKey,
                    ruleKey,
                    enabled: false,
                    config: {},
                    impressions: 0,
                    clicks: 0,
                    revenueCents: 0,
                }
            );
        }) as AutomationRule[];

        const totals = mergedRules.reduce(
            (acc, rule) => ({
                impressions: acc.impressions + Number(rule.impressions ?? 0),
                clicks: acc.clicks + Number(rule.clicks ?? 0),
                revenueCents: acc.revenueCents + Number(rule.revenueCents ?? 0),
            }),
            { impressions: 0, clicks: 0, revenueCents: 0 },
        );

        return { rules: mergedRules, stats: totals };
    }, [data]);

    const statsLoading = isLoading && !data;
    const loadError =
        !activeShopDomain
            ? 'Missing shop context. Open the app from Shopify so automation data can load for the current store.'
            : isError
              ? queryError instanceof Error
                  ? queryError.message
                  : 'Failed to load automation rules.'
              : error;

    const handleToggleStatus = async (rule: AutomationRule) => {
        try {
            setSavingRuleKey(rule.ruleKey);
            setError(null);

            if (!activeShopDomain) {
                throw new Error('Missing shop context. Refresh the app from Shopify and try again.');
            }

            const nextEnabled = !rule.enabled;
            if (nextEnabled && atLimit) {
                setError('Monthly impression limit reached. Upgrade your plan on Plans to activate automations.');
                return;
            }

            const cacheKey = queryKeys.automationsOverview(activeShopDomain);
            const previous = queryClient.getQueryData<{ rules?: AutomationRule[]; totals?: AutomationStats }>(cacheKey);

            queryClient.setQueryData(cacheKey, (current: { rules?: AutomationRule[]; totals?: AutomationStats } | undefined) => {
                const currentRules = normalizeAutomationRules(current?.rules ?? previous?.rules);
                const nextRules = visibleRuleKeys.map((ruleKey) => {
                    const existing = currentRules.find((item) => item.ruleKey === ruleKey);
                    const base =
                        existing ??
                        ({
                            id: ruleKey,
                            ruleKey,
                            enabled: false,
                            config: {},
                            impressions: 0,
                            clicks: 0,
                            revenueCents: 0,
                        } as AutomationRule);

                    if (ruleKey !== rule.ruleKey) {
                        return base;
                    }

                    return { ...base, enabled: nextEnabled };
                });

                return {
                    ok: true,
                    ...(current ?? previous ?? {}),
                    rules: nextRules,
                };
            });

            const response = await fetch('/api/automations/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shopDomain: activeShopDomain,
                    ruleKey: rule.ruleKey,
                    enabled: nextEnabled,
                }),
            });

            const payload = (await response.json()) as { ok?: boolean; error?: string; rule?: AutomationRule };
            if (!response.ok || !payload.ok || !payload.rule) {
                if (previous) {
                    queryClient.setQueryData(cacheKey, previous);
                }
                throw new Error(payload.error || 'Failed to update automation rule.');
            }

            queryClient.setQueryData(cacheKey, (current: { rules?: AutomationRule[] } | undefined) => {
                const currentRules = normalizeAutomationRules(current?.rules ?? previous?.rules);
                const savedRule = normalizeAutomationRule(payload.rule as unknown as Record<string, unknown>);
                return {
                    ok: true,
                    ...(current ?? previous ?? {}),
                    rules: visibleRuleKeys.map((ruleKey) => {
                        const existing = currentRules.find((item) => item.ruleKey === ruleKey);
                        if (ruleKey !== savedRule.ruleKey) {
                            return existing ?? {
                                id: ruleKey,
                                ruleKey,
                                enabled: false,
                                config: {},
                                impressions: 0,
                                clicks: 0,
                                revenueCents: 0,
                            };
                        }

                        return {
                            ...(existing ?? savedRule),
                            ...savedRule,
                            impressions: existing?.impressions ?? savedRule.impressions ?? 0,
                            clicks: existing?.clicks ?? savedRule.clicks ?? 0,
                            revenueCents: existing?.revenueCents ?? savedRule.revenueCents ?? 0,
                        };
                    }),
                };
            });
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to update automation rule.');
        } finally {
            setSavingRuleKey(null);
        }
    };

    return (
        <PageLoadingShell
            title="Automations"
            isLoading={statsLoading}
            hasData={true}
            isFetching={isFetching}
            error={loadError}
        >
        <div className="min-h-full bg-slate-50/80 p-4 sm:p-6 md:p-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Automations</h1>
                        <p className="mt-1 text-sm text-slate-500">Set up automated workflows to engage your audience.</p>
                    </div>
                </div>

                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-xl font-semibold text-slate-950">Stats</h2>
                        <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-600 shadow-sm">
                            <Calendar className="h-4 w-4" />
                            <span>All time</span>
                        </div>
                    </div>

                    <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
                        <CardContent className="grid grid-cols-1 divide-y divide-slate-200 p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
                            {statsLoading ? (
                                <>
                                    <Skeleton className="m-5 h-16 w-auto rounded-xl" />
                                    <Skeleton className="m-5 h-16 w-auto rounded-xl" />
                                    <Skeleton className="m-5 h-16 w-auto rounded-xl" />
                                </>
                            ) : (
                                <>
                                    <div className="px-5 py-4">
                                        <p className="text-sm text-slate-500">Impressions</p>
                                        <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">{formatNumber(stats?.impressions ?? 0)}</p>
                                    </div>
                                    <div className="px-5 py-4">
                                        <p className="text-sm text-slate-500">Clicks</p>
                                        <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">{formatNumber(stats?.clicks ?? 0)}</p>
                                    </div>
                                    <div className="px-5 py-4">
                                        <p className="text-sm text-slate-500">Revenue generated</p>
                                        <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">{formatCurrency((stats?.revenueCents ?? 0) / 100)}</p>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </section>

                {isFetching && data ? (
                    <p className="text-xs text-slate-500">Refreshing automations…</p>
                ) : null}

                {loadError ? (
                    <Card className="rounded-2xl border-red-200 bg-red-50 shadow-sm">
                        <CardContent className="p-6 text-sm text-destructive">{loadError}</CardContent>
                    </Card>
                ) : null}

                <section>
                    <h2 className="mb-4 text-xl font-semibold tracking-tight text-slate-950">All automations</h2>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {rules.map((rule) => {
                                  const definition = automationDefinitions[rule.ruleKey];
                                  const Icon = definition.icon;
                                  const footerStatusText = rule.enabled ? 'Activated.' : definition.footerStatusText;

                                  return (
                                      <Card key={rule.id} className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
                                          <CardHeader className="space-y-0 px-5 pb-4 pt-5">
                                              <div className="flex items-start gap-4">
                                                  <div className="rounded-2xl bg-slate-100 p-3 text-violet-600">
                                                      <Icon className="h-5 w-5" />
                                                  </div>
                                                  <div className="flex-1">
                                                      <div className="flex flex-wrap items-center gap-2">
                                                          <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950">{definition.title}</CardTitle>
                                                          <Badge className={getStatusBadgeClassName(rule.enabled)}>{rule.enabled ? 'Active' : 'Inactive'}</Badge>
                                                      </div>
                                                      <CardDescription className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{definition.description}</CardDescription>
                                                  </div>
                                              </div>
                                          </CardHeader>
                                          <CardContent className="grid grid-cols-3 gap-6 px-5 pb-5 text-center">
                                              <div>
                                                  <p className="text-3xl font-semibold tracking-tight text-slate-950">{formatNumber(rule.impressions ?? 0)}</p>
                                                  <p className="mt-1 text-xs text-slate-500">Impressions</p>
                                              </div>
                                              <div>
                                                  <p className="text-3xl font-semibold tracking-tight text-slate-950">{formatNumber(rule.clicks ?? 0)}</p>
                                                  <p className="mt-1 text-xs text-slate-500">Clicks</p>
                                              </div>
                                              <div>
                                                  <p className="text-3xl font-semibold tracking-tight text-slate-950">{formatCurrency((rule.revenueCents ?? 0) / 100)}</p>
                                                  <p className="mt-1 text-xs text-slate-500">Revenue</p>
                                              </div>
                                          </CardContent>
                                          <Separator className="bg-slate-200" />
                                          <CardFooter className="flex items-center justify-between gap-3 px-5 py-3">
                                              <div className="flex items-center gap-2">
                                                  <Button
                                                      size="sm"
                                                      className={getActionButtonClassName(rule.enabled)}
                                                      onClick={() => handleToggleStatus(rule)}
                                                      disabled={
                                                          savingRuleKey === rule.ruleKey ||
                                                          (!rule.enabled && atLimit)
                                                      }
                                                      title={
                                                          !rule.enabled && atLimit
                                                              ? 'Monthly impression limit reached.'
                                                              : undefined
                                                      }
                                                  >
                                                      {savingRuleKey === rule.ruleKey ? 'Saving...' : rule.enabled ? 'Deactivate' : 'Activate'}
                                                  </Button>
                                                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100" asChild>
                                                      <Link href={activeShopDomain ? `${definition.href}?shop=${encodeURIComponent(activeShopDomain)}` : definition.href}>
                                                          View Flow <ArrowRight className="ml-2 h-4 w-4" />
                                                      </Link>
                                                  </Button>
                                              </div>
                                              <span className="text-sm text-slate-400">{footerStatusText}</span>
                                          </CardFooter>
                                      </Card>
                                  );
                              })}
                    </div>
                </section>
            </div>
        </div>
        </PageLoadingShell>
    );
}
