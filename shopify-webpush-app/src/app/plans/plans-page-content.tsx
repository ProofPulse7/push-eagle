'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Check, Info, Sparkles, Zap } from 'lucide-react';
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
        'relative flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border-2 pe-pressable shadow-sm',
        active && 'border-primary shadow-lg ring-2 ring-primary/25',
        highlighted && !active && 'border-primary/60 shadow-md',
        !active && !highlighted && 'border-border',
      )}
    >
      {highlighted && !active ? (
        <span className="absolute right-4 top-4 z-10 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          Most popular
        </span>
      ) : null}
      {active ? (
        <span className="absolute right-4 top-4 z-10 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Current plan
        </span>
      ) : null}

      <CardHeader className={cn('shrink-0 pb-3 pt-6', highlighted ? 'bg-primary/5' : 'bg-muted/30')}>
        <div className="flex items-center gap-4 pr-24">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              highlighted ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription className="text-base">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-6 pb-4 pt-2">
        <p className="shrink-0 text-5xl font-bold tracking-tight">
          {price}
          {priceSuffix ? (
            <span className="ml-1 text-lg font-normal text-muted-foreground">{priceSuffix}</span>
          ) : null}
        </p>

        <div
          className={cn(
            'mt-5 flex h-[7.75rem] shrink-0 flex-col justify-center rounded-xl border px-4',
            highlighted ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/30',
          )}
        >
          {children}
        </div>

        <ul className="mt-5 flex-1 space-y-2.5 border-t border-border pt-5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm md:text-base">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="shrink-0 px-6 pb-6 pt-2">
        <div className="w-full">{footer}</div>
      </CardFooter>
    </Card>
  );
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
    <div className="mx-auto flex min-h-0 flex-1 flex-col gap-5 px-4 py-5 pe-page-enter sm:px-6 lg:max-w-6xl lg:px-8">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Plans</h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Impressions include manual campaigns and automation sends. Limits reset on the 1st of each
          month.
          {refreshHint ? ` ${refreshHint}` : ''}
        </p>
      </div>

      <ImpressionUsageBar className="shrink-0 rounded-xl" compact />

      {billingStatus === 'pending' && currentPlanKey !== 'basic' ? (
        <p className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 dark:text-amber-100">
          Your Business plan is waiting for approval in Shopify. Complete billing there, or switch to
          the free Basic plan to start sending notifications right away.
        </p>
      ) : null}

      {isOnPaidPlan ? (
        <p className="shrink-0 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          Switching to Basic cancels your paid Shopify subscription so you are not charged going
          forward.
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
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
              className="h-11 w-full pe-pressable text-base"
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
          <p className="flex items-center gap-2.5 text-sm font-medium text-foreground md:text-base">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            {BASIC_PLAN.impressions.toLocaleString()} impressions per month
          </p>
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
              className="h-11 w-full pe-pressable text-base"
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
          <div className="flex w-full flex-col justify-center gap-2">
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
            <p className="text-sm font-semibold md:text-base">
              {selectedTier.impressions.toLocaleString()} impressions / month
            </p>
          </div>
        </PlanCard>
      </div>
    </div>
  );
}
