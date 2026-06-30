'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import {
  BarChart3,
  Bell,
  Check,
  CreditCard,
  Info,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSINESS_TIERS, BASIC_PLAN } from '@/lib/client/billing-plans';
import { useBillingStatus, useConfirmBilling, useSubscribePlan } from '@/hooks/queries/use-billing';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { useToast } from '@/hooks/use-toast';
import { ImpressionUsageBar } from '@/components/billing/impression-usage-bar';

const BUSINESS_FEATURES = [
  'Everything in Basic',
  'Higher monthly impression limits',
  'Core automations (welcome & abandoned cart)',
  'Campaigns & scheduling',
  'Analytics & segments',
  'Priority email support',
];

const BASIC_FEATURES = [
  '10,000 impressions / month',
  'Unlimited subscribers',
  'Campaigns & scheduling',
  'Core automations (welcome & abandoned cart)',
  'Segments & opt-in prompts',
  'Chat support',
];

const TRUST_ITEMS = [
  { icon: CreditCard, label: 'Billed securely through Shopify' },
  { icon: RefreshCw, label: 'Upgrade or downgrade anytime' },
  { icon: Shield, label: 'No hidden fees or contracts' },
];

const COMPARISON_ROWS = [
  { feature: 'Monthly impressions', basic: '10,000', business: '20K – 1M (slider)' },
  { feature: 'Unlimited subscribers', basic: true, business: true },
  { feature: 'Manual campaigns', basic: true, business: true },
  { feature: 'Welcome & cart automations', basic: true, business: true },
  { feature: 'Segments & opt-ins', basic: true, business: true },
  { feature: 'Analytics & reporting', basic: 'Basic', business: 'Full' },
  { feature: 'Support', basic: 'Chat', business: 'Priority email' },
];

const FAQ_ITEMS = [
  {
    question: 'What counts as an impression?',
    answer:
      'Each push notification delivered to a subscriber counts as one impression — including manual campaigns and automation sends.',
  },
  {
    question: 'When do limits reset?',
    answer:
      'Your impression allowance resets on the 1st of each calendar month. Unused impressions do not roll over.',
  },
  {
    question: 'How does Business billing work?',
    answer:
      'Choose your monthly volume with the slider, then approve the subscription in Shopify. You can change tiers or switch back to Basic at any time.',
  },
];

type PendingPlanKey = 'basic' | `business:${string}`;

function PlanCard({
  title,
  description,
  price,
  priceSuffix,
  features,
  footer,
  active,
  highlighted,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  price: React.ReactNode;
  priceSuffix?: string;
  features: string[];
  footer: React.ReactNode;
  active?: boolean;
  highlighted?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'relative flex min-h-[520px] flex-col overflow-hidden rounded-2xl border-2 pe-pressable transition-shadow',
        active && 'border-primary shadow-lg ring-2 ring-primary/25',
        highlighted && !active && 'border-primary/60 shadow-xl',
        !active && !highlighted && 'border-border shadow-sm hover:shadow-md',
      )}
    >
      {highlighted ? (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/80 via-primary to-primary/80" />
      ) : null}
      {highlighted && !active ? (
        <span className="absolute right-4 top-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
          Most popular
        </span>
      ) : null}
      {active ? (
        <span className="absolute right-4 top-4 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Current plan
        </span>
      ) : null}

      <CardHeader className={cn('space-y-4 pb-2 pt-8', highlighted ? 'bg-primary/5' : 'bg-muted/30')}>
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              highlighted ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-1 pr-24">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription className="text-base">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-grow flex-col gap-6 px-6 pb-4 pt-4">
        <div>
          <p className="text-5xl font-bold tracking-tight">
            {price}
            {priceSuffix ? (
              <span className="ml-1 text-lg font-normal text-muted-foreground">{priceSuffix}</span>
            ) : null}
          </p>
        </div>

        {children}

        <div className="border-t pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What&apos;s included
          </p>
          <ul className="space-y-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>

      <CardFooter className="px-6 pb-6 pt-2">
        <div className="w-full">{footer}</div>
      </CardFooter>
    </Card>
  );
}

function ComparisonValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return <Check className="mx-auto h-5 w-5 text-green-500" />;
  }
  if (value === false) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="text-sm font-medium">{value}</span>;
}

export function PlansPageContent() {
  const shop = useShopDomain();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { data, isFetching } = useBillingStatus({ refetchOnMount: false, reconcile: false });
  const confirmBilling = useConfirmBilling();
  const subscribePlan = useSubscribePlan();
  const [tierIndex, setTierIndex] = useState(0);
  const [pendingPlan, setPendingPlan] = useState<PendingPlanKey | null>(null);

  const host = searchParams.get('host');
  const embedded = searchParams.get('embedded');

  const billing = (data?.billing ?? null) as Record<string, unknown> | null;
  const billingStatus = String(billing?.status ?? 'active');
  const currentPlanKey = String(billing?.planKey ?? 'basic');
  const currentTierId = billing?.tierId ? String(billing.tierId) : null;
  const isBillingActive = billingStatus === 'active';

  const isCurrentBasic = isBillingActive && currentPlanKey === 'basic';
  const isCurrentBusinessTier = (tierId: string) =>
    isBillingActive && currentPlanKey === 'business' && currentTierId === tierId;
  const isOnPaidPlan = isBillingActive && currentPlanKey === 'business';

  const selectedTier = BUSINESS_TIERS[tierIndex] ?? BUSINESS_TIERS[0];
  const minBusinessTier = BUSINESS_TIERS[0];
  const maxBusinessTier = BUSINESS_TIERS[BUSINESS_TIERS.length - 1];
  const pricePerThousand =
    selectedTier.impressions > 0
      ? ((selectedTier.priceUsd / selectedTier.impressions) * 1000).toFixed(2)
      : '0';

  useEffect(() => {
    if (currentTierId) {
      const index = BUSINESS_TIERS.findIndex((tier) => tier.id === currentTierId);
      if (index >= 0) {
        setTierIndex(index);
      }
    }
  }, [currentTierId]);

  const billingReturnHandled = useRef(false);
  useEffect(() => {
    if (searchParams.get('billing') !== 'return' || billingReturnHandled.current || !shop) {
      return;
    }

    billingReturnHandled.current = true;
    confirmBilling.mutate(undefined, {
      onSuccess: (result) => {
        setPendingPlan(null);

        if (result?.activated || String(result?.billing?.status ?? '') === 'active') {
          toast({
            title: 'Plan updated',
            description: 'Your new plan is active in Push Eagle.',
          });
          return;
        }

        toast({
          variant: 'destructive',
          title: 'Billing confirmation pending',
          description:
            typeof result?.message === 'string'
              ? result.message
              : 'Complete approval in Shopify if you have not already.',
        });
      },
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Could not confirm billing',
          description: error instanceof Error ? error.message : 'Try refreshing the page.',
        });
      },
    });
  }, [searchParams, shop, confirmBilling, toast]);

  const startShopifyCheckout = (planKey: 'basic' | 'business', tierId?: string) => {
    if (!shop) {
      toast({
        variant: 'destructive',
        title: 'Missing shop',
        description: 'Open Push Eagle from Shopify admin, then try again.',
      });
      return;
    }

    const pendingKey: PendingPlanKey =
      planKey === 'business' && tierId ? `business:${tierId}` : planKey;
    setPendingPlan(pendingKey);

    const params = new URLSearchParams({
      shop,
      planKey,
    });
    if (tierId) {
      params.set('tierId', tierId);
    }
    if (host) {
      params.set('host', host);
    }
    if (embedded) {
      params.set('embedded', embedded);
    }

    const checkoutUrl = `/api/billing/subscribe-redirect?${params.toString()}`;
    (window.top ?? window).location.assign(checkoutUrl);
  };

  const handleSubscribeBasic = () => {
    if (!shop) {
      toast({
        variant: 'destructive',
        title: 'Missing shop',
        description: 'Open Push Eagle from Shopify admin, then try again.',
      });
      return;
    }

    if (isCurrentBasic) {
      return;
    }

    const wasOnPaidPlan = isOnPaidPlan;
    subscribePlan.mutate(
      {
        planKey: 'basic',
        host: host ?? undefined,
        embedded: embedded ?? undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: wasOnPaidPlan ? 'Switched to Basic' : 'Basic plan active',
            description: wasOnPaidPlan
              ? 'Your paid Shopify subscription was cancelled. You will not be charged going forward.'
              : 'Your free Basic plan is active.',
          });
        },
        onError: (error) => {
          toast({
            variant: 'destructive',
            title: 'Could not update plan',
            description: error instanceof Error ? error.message : 'Try again in a moment.',
          });
        },
      },
    );
  };
  const handleSubscribeBusiness = () => startShopifyCheckout('business', selectedTier.id);

  const basicButtonLabel = useMemo(() => {
    if (subscribePlan.isPending && subscribePlan.variables?.planKey === 'basic') {
      return isOnPaidPlan ? 'Updating plan…' : 'Activating…';
    }
    if (isCurrentBasic) {
      return 'Current plan';
    }
    if (isOnPaidPlan) {
      return 'Switch to free plan';
    }
    return 'Activate free plan';
  }, [isCurrentBasic, isOnPaidPlan, subscribePlan.isPending, subscribePlan.variables?.planKey]);

  const businessButtonLabel = useMemo(() => {
    const pendingKey: PendingPlanKey = `business:${selectedTier.id}`;
    if (pendingPlan === pendingKey) {
      return 'Opening Shopify…';
    }
    if (isCurrentBusinessTier(selectedTier.id)) {
      return 'Current plan';
    }
    if (billingStatus === 'pending') {
      return 'Approve in Shopify…';
    }
    return 'Subscribe with Shopify';
  }, [billingStatus, isCurrentBusinessTier, pendingPlan, selectedTier.id]);

  const refreshHint = useMemo(
    () => (isFetching ? 'Syncing usage with Shopify…' : null),
    [isFetching],
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-6 pe-page-enter sm:px-6 md:py-10">
      <section className="space-y-4 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
          <Bell className="h-4 w-4 text-primary" />
          Simple pricing for every store size
        </div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Choose the right plan</h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
          Start free with Basic, then scale impressions as your store grows. All plans include
          unlimited subscribers, campaigns, and core automations.
          {refreshHint ? ` ${refreshHint}` : ''}
        </p>
      </section>

      <ImpressionUsageBar className="rounded-xl shadow-sm" />

      {billingStatus === 'pending' && currentPlanKey !== 'basic' ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Your Business plan is waiting for approval in Shopify. Complete billing there, or switch to
          the free Basic plan to start sending notifications right away.
        </p>
      ) : null}

      {isOnPaidPlan ? (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Switching to Basic cancels your paid Shopify subscription so you are not charged going
          forward. Push Eagle updates instantly after the change completes.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-6 rounded-xl border bg-card px-6 py-4 shadow-sm">
        {TRUST_ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-2">
        <PlanCard
          title="Basic"
          description="Free — perfect to get started"
          price="$0"
          priceSuffix="/mo"
          features={BASIC_FEATURES}
          active={isCurrentBasic}
          icon={Zap}
          footer={
            <Button
              className="h-12 w-full pe-pressable text-base"
              size="lg"
              variant={isCurrentBasic ? 'secondary' : 'outline'}
              disabled={
                isCurrentBasic ||
                (subscribePlan.isPending && subscribePlan.variables?.planKey === 'basic')
              }
              onClick={handleSubscribeBasic}
            >
              {basicButtonLabel}
            </Button>
          }
        >
          <div className="rounded-xl border bg-muted/40 px-4 py-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong className="font-semibold text-foreground">
                  {BASIC_PLAN.impressions.toLocaleString()}
                </strong>{' '}
                impressions included every month
              </span>
            </p>
          </div>
        </PlanCard>

        <PlanCard
          title="Business"
          description="Scale with flexible monthly limits"
          price={`$${selectedTier.priceUsd}`}
          priceSuffix="/mo"
          features={BUSINESS_FEATURES}
          active={isCurrentBusinessTier(selectedTier.id)}
          highlighted
          icon={Sparkles}
          footer={
            <Button
              className="h-12 w-full pe-pressable text-base"
              size="lg"
              disabled={
                isCurrentBusinessTier(selectedTier.id) ||
                pendingPlan === `business:${selectedTier.id}`
              }
              onClick={handleSubscribeBusiness}
            >
              {businessButtonLabel}
            </Button>
          }
        >
          <div className="space-y-4 rounded-xl border bg-primary/5 px-4 py-4">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{minBusinessTier.impressions.toLocaleString()}</span>
              <span>{maxBusinessTier.impressions.toLocaleString()}</span>
            </div>
            <Slider
              value={[tierIndex]}
              max={BUSINESS_TIERS.length - 1}
              step={1}
              onValueChange={(value) => setTierIndex(value[0] ?? 0)}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-semibold">
                {selectedTier.impressions.toLocaleString()} impressions / month
              </p>
              <p className="text-xs text-muted-foreground">~${pricePerThousand} per 1K sends</p>
            </div>
          </div>
        </PlanCard>
      </div>

      <section className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Compare plans</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            See what you get on each plan at a glance.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-5 py-4 font-semibold">Feature</th>
                  <th className="px-5 py-4 text-center font-semibold">Basic</th>
                  <th className="px-5 py-4 text-center font-semibold text-primary">Business</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, index) => (
                  <tr
                    key={row.feature}
                    className={cn('border-b last:border-0', index % 2 === 0 && 'bg-muted/20')}
                  >
                    <td className="px-5 py-3.5 font-medium">{row.feature}</td>
                    <td className="px-5 py-3.5 text-center">
                      <ComparisonValue value={row.basic} />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <ComparisonValue value={row.business} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Unlimited subscribers</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Grow your audience without per-subscriber fees. Only delivered notifications count toward
            your monthly limit.
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Transparent usage</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Track impressions in real time from your dashboard. Know exactly how much of your plan
            you have used before you send.
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RefreshCw className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Flexible billing</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Move between Business tiers or return to Basic whenever you need. Changes are handled
            through your Shopify admin.
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Frequently asked questions</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {FAQ_ITEMS.map((item) => (
            <Card key={item.question} className="rounded-xl border bg-muted/20 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base leading-snug">{item.question}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                {item.answer}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
