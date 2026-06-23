'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { DateRange } from 'react-day-picker';
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

import { useAutomationsOverview, useAutomationStats } from '@/hooks/queries/use-app-queries';
import { toggleAutomationRuleEnabled } from '@/hooks/use-automation-rule-toggle';
import { readPendingAutomationEnabled } from '@/lib/client/optimistic-automations';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { normalizeAutomationRules } from '@/lib/client/normalize-automation-rule';
import { formatCampaignDateRangeLabel } from '@/lib/client/campaign-date-range-label';
import { readAutomationStatsFromCache, readAutomationsOverviewFromCache } from '@/lib/client/automation-stats-cache';
import { prefetchAppBootstrap } from '@/lib/client/query-fetchers';
import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { AutomationStats } from '@/components/automations/automation-stats';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { isComingSoonAutomation } from '@/lib/client/coming-soon-automations';

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
        footerStatusText: 'Inactive.',
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
    const router = useRouter();
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const statsRange = useMemo(() => {
        if (!date?.from && !date?.to) {
            return { fromIso: 'all', toIso: 'all' };
        }

        const range = resolveAnalyticsDateRange({
            from: date.from,
            to: date.to ?? date.from,
        });
        return { fromIso: range.fromIso, toIso: range.toIso };
    }, [date?.from, date?.to]);

    const cachedOverview = activeShopDomain
        ? readAutomationsOverviewFromCache(queryClient, activeShopDomain)
        : undefined;
    const { data, isLoading, isFetching, isError, error: queryError } = useAutomationsOverview();
    const { data: statsData, isFetching: isStatsFetching } = useAutomationStats(date?.from, date?.to);
    const effectiveOverview = data ?? cachedOverview;
    const effectiveStats =
        statsData ??
        (activeShopDomain
            ? readAutomationStatsFromCache(
                  queryClient,
                  activeShopDomain,
                  statsRange.fromIso,
                  statsRange.toIso,
              )
            : undefined);
    const [error, setError] = useState<string | null>(null);
    const statsPeriodLabel = formatCampaignDateRangeLabel(date);

    useEffect(() => {
        if (!activeShopDomain) {
            return;
        }

        void prefetchAppBootstrap(queryClient, activeShopDomain);
        void queryClient.invalidateQueries({
            predicate: (query) => {
                const key = query.queryKey;
                return (
                    Array.isArray(key)
                    && key[0] === 'pe'
                    && key[1] === activeShopDomain
                    && key[2] === 'automations'
                );
            },
            refetchType: 'active',
        });
    }, [activeShopDomain, queryClient]);

    useEffect(() => {
        if (!activeShopDomain) {
            return;
        }

        for (const ruleKey of ['welcome_subscriber', 'cart_abandonment_30m'] as const) {
            const href = `${automationDefinitions[ruleKey].href}?shop=${encodeURIComponent(activeShopDomain)}`;
            router.prefetch(href);
        }
    }, [activeShopDomain, router]);

    const visibleRuleKeysSet = useMemo(() => new Set<RuleKey>(visibleRuleKeys), []);

    const { rules } = useMemo(() => {
        const overviewRules = normalizeAutomationRules(effectiveOverview?.rules).filter((rule) =>
            visibleRuleKeysSet.has(rule.ruleKey as RuleKey),
        );
        const statsRules = normalizeAutomationRules(effectiveStats?.rules);
        const statsByRuleKey = new Map(
            statsRules.map((rule) => [rule.ruleKey, rule]),
        );

        const mergedRules = visibleRuleKeys.map((ruleKey) => {
            const found = overviewRules.find((rule) => rule.ruleKey === ruleKey);
            const statsRule = statsByRuleKey.get(ruleKey);
            const base =
                found ?? {
                    id: ruleKey,
                    ruleKey,
                    enabled: false,
                    config: {},
                    impressions: 0,
                    clicks: 0,
                    revenueCents: 0,
                };

            const pendingEnabled = activeShopDomain
                ? readPendingAutomationEnabled(activeShopDomain, ruleKey)
                : undefined;

            return {
                ...base,
                enabled: pendingEnabled !== undefined ? pendingEnabled : base.enabled,
                impressions: Number(statsRule?.impressions ?? base.impressions ?? 0),
                clicks: Number(statsRule?.clicks ?? base.clicks ?? 0),
                revenueCents: Number(statsRule?.revenueCents ?? base.revenueCents ?? 0),
            };
        }) as AutomationRule[];

        return { rules: mergedRules };
    }, [activeShopDomain, effectiveOverview, effectiveStats, visibleRuleKeysSet]);

    const statsLoading = Boolean(activeShopDomain) && isLoading && !effectiveOverview;
    const showStatsRefresh = (isFetching && Boolean(effectiveOverview)) || (isStatsFetching && Boolean(effectiveStats));
    const loadError =
        !activeShopDomain
            ? 'Missing shop context. Open the app from Shopify so automation data can load for the current store.'
            : isError
              ? queryError instanceof Error
                  ? queryError.message
                  : 'Failed to load automation rules.'
              : error;

    const handleToggleStatus = (rule: AutomationRule) => {
        if (isComingSoonAutomation(rule.ruleKey)) {
            return;
        }

        if (!activeShopDomain) {
            setError('Missing shop context. Refresh the app from Shopify and try again.');
            return;
        }

        const nextEnabled = !rule.enabled;
        if (nextEnabled && atLimit) {
            setError('Monthly impression limit reached. Upgrade your plan on Plans to activate automations.');
            return;
        }

        setError(null);

        void (async () => {
            const result = await toggleAutomationRuleEnabled({
                shop: activeShopDomain,
                ruleKey: rule.ruleKey,
                currentEnabled: rule.enabled,
                queryClient,
                atLimit,
            });
            if (!result.ok) {
                setError(result.error);
            }
        })();
    };

    const navigateToFlow = (href: string) => {
        const target = activeShopDomain ? `${href}?shop=${encodeURIComponent(activeShopDomain)}` : href;
        router.push(target);
    };

    return (
        <PageLoadingShell
            title="Automations"
            isLoading={statsLoading}
            hasData={Boolean(activeShopDomain) || Boolean(effectiveOverview) || Boolean(loadError)}
            isFetching={showStatsRefresh}
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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-950">Stats</h2>
                            <p className="text-sm text-slate-500">Showing metrics for {statsPeriodLabel}.</p>
                        </div>
                        <DateRangePicker date={date} setDate={setDate} />
                    </div>

                    <AutomationStats date={date} />
                </section>

                {loadError && !effectiveOverview ? (
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
                                  const comingSoon = isComingSoonAutomation(rule.ruleKey);
                                  const footerStatusText = comingSoon
                                    ? 'Coming soon.'
                                    : rule.enabled
                                      ? 'Activated.'
                                      : 'Inactive.';

                                  return (
                                      <Card key={rule.id} className="relative overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
                                          {comingSoon ? (
                                              <div className="absolute right-4 top-4 z-10">
                                                  <Badge className="border-0 bg-violet-600 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-600">
                                                      Coming soon
                                                  </Badge>
                                              </div>
                                          ) : null}
                                          <CardHeader className="space-y-0 px-5 pb-4 pt-5">
                                              <div className="flex items-start gap-4">
                                                  <div className="rounded-2xl bg-slate-100 p-3 text-violet-600">
                                                      <Icon className="h-5 w-5" />
                                                  </div>
                                                  <div className="flex-1">
                                                      <div className="flex flex-wrap items-center gap-2">
                                                          <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950">{definition.title}</CardTitle>
                                                          {!comingSoon ? (
                                                              <Badge className={getStatusBadgeClassName(rule.enabled)}>{rule.enabled ? 'Active' : 'Inactive'}</Badge>
                                                          ) : null}
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
                                                      className={
                                                          comingSoon
                                                              ? 'h-8 cursor-not-allowed rounded-lg bg-slate-200 px-3 text-xs font-semibold text-slate-400 hover:bg-slate-200'
                                                              : getActionButtonClassName(rule.enabled)
                                                      }
                                                      onClick={() => handleToggleStatus(rule)}
                                                      disabled={comingSoon || (!rule.enabled && atLimit)}
                                                      title={
                                                          comingSoon
                                                              ? 'This automation is coming soon.'
                                                              : !rule.enabled && atLimit
                                                                ? 'Monthly impression limit reached.'
                                                                : undefined
                                                      }
                                                  >
                                                      {comingSoon ? 'Activate' : rule.enabled ? 'Deactivate' : 'Activate'}
                                                  </Button>
                                                  {comingSoon ? (
                                                      <Button
                                                          variant="outline"
                                                          size="sm"
                                                          className="h-8 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-400"
                                                          disabled
                                                      >
                                                          View Flow <ArrowRight className="ml-2 h-4 w-4" />
                                                      </Button>
                                                  ) : (
                                                      <Button
                                                          variant="outline"
                                                          size="sm"
                                                          className="h-8 rounded-lg border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                                          onClick={() => navigateToFlow(definition.href)}
                                                      >
                                                          View Flow <ArrowRight className="ml-2 h-4 w-4" />
                                                      </Button>
                                                  )}
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
