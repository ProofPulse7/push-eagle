'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Check, Info, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSINESS_TIERS, BASIC_PLAN } from '@/lib/client/billing-plans';
import { ApiError } from '@/lib/client/api-fetch';
import { useBillingStatus, useConfirmBilling, useSubscribePlan } from '@/hooks/queries/use-billing';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { useToast } from '@/hooks/use-toast';
import { ImpressionUsageBar } from '@/components/billing/impression-usage-bar';

const BUSINESS_FEATURES = [
  'All Basic features',
  'Higher impression limits',
  'All automations',
  'Campaigns & scheduling',
  'Analytics & segments',
];

const BASIC_FEATURES = [
  '10,000 impressions / month',
  'Unlimited subscribers',
  'Campaigns & scheduling',
  'All automations',
  'Analytics',
  'Chat support',
];

const ENTERPRISE_FEATURES = [
  'Custom impression volume',
  'Dedicated onboarding',
  'Priority support',
  'Custom contracts',
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
  children,
}: {
  title: string;
  description: string;
  price: React.ReactNode;
  priceSuffix?: string;
  features: string[];
  footer: React.ReactNode;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'flex h-full flex-col pe-pressable',
        active && 'border-primary ring-2 ring-primary/30',
      )}
    >
      <CardHeader className="bg-muted/40">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-grow flex-col gap-4 pt-6">
        <p className="text-4xl font-bold">
          {price}
          {priceSuffix ? (
            <span className="text-base font-normal text-muted-foreground">{priceSuffix}</span>
          ) : null}
        </p>
        {children}
        <ul className="space-y-2 text-sm">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-green-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>{footer}</CardFooter>
    </Card>
  );
}

const appendShopifyAdminParams = (targetUrl: string, host: string | null, embedded: string | null) => {
  const url = new URL(targetUrl);
  if (host) {
    url.searchParams.set('host', host);
  }
  if (embedded) {
    url.searchParams.set('embedded', embedded);
  }
  return url.toString();
};

export function PlansPageContent() {
  const shop = useShopDomain();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { data, isFetching } = useBillingStatus({ refetchOnMount: true, reconcile: true });
  const confirmBilling = useConfirmBilling();
  const subscribePlan = useSubscribePlan();
  const [tierIndex, setTierIndex] = useState(0);
  const [pendingPlan, setPendingPlan] = useState<PendingPlanKey | null>(null);
  const [completedPlan, setCompletedPlan] = useState<PendingPlanKey | null>(null);
  const completedTimerRef = useRef<number>();

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

  const selectedTier = BUSINESS_TIERS[tierIndex] ?? BUSINESS_TIERS[0];

  useEffect(() => {
    return () => {
      window.clearTimeout(completedTimerRef.current);
    };
  }, []);

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
        if (result?.activated) {
          toast({
            title: 'Billing updated',
            description: 'Your plan is synced with your Shopify subscription.',
          });
          return;
        }

        if (String(result?.billing?.status ?? '') === 'active') {
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

  const markPlanCompleted = (planKey: PendingPlanKey) => {
    setCompletedPlan(planKey);
    window.clearTimeout(completedTimerRef.current);
    completedTimerRef.current = window.setTimeout(() => setCompletedPlan(null), 2200);
  };

  const redirectForReauthorize = (reauthorizeUrl: string) => {
    const target = appendShopifyAdminParams(reauthorizeUrl, host, embedded);
    (window.top ?? window).location.href = target;
  };

  const handleSubscribe = (planKey: 'basic' | 'business', tierId?: string) => {
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
    setCompletedPlan(null);

    subscribePlan.mutate(
      {
        planKey,
        tierId,
        host: host ?? undefined,
        embedded: embedded ?? undefined,
      },
      {
        onSuccess: (result) => {
          if (result.confirmationUrl) {
            (window.top ?? window).location.href = result.confirmationUrl;
            return;
          }

          setPendingPlan(null);
          markPlanCompleted(pendingKey);
          toast({
            title: 'Plan updated',
            description:
              planKey === 'basic'
                ? 'Basic plan is now active for your store.'
                : 'Your Business plan is now active.',
          });
        },
        onError: (error) => {
          setPendingPlan(null);

          if (error instanceof ApiError && error.reauthorizeUrl) {
            toast({
              variant: 'destructive',
              title: 'Reconnect Push Eagle',
              description: 'Opening Shopify to refresh your store connection…',
            });
            redirectForReauthorize(error.reauthorizeUrl);
            return;
          }

          toast({
            variant: 'destructive',
            title: 'Could not start checkout',
            description: error instanceof Error ? error.message : 'Please try again.',
          });
        },
      },
    );
  };

  const handleSubscribeBasic = () => handleSubscribe('basic');
  const handleSubscribeBusiness = () => handleSubscribe('business', selectedTier.id);

  const basicButtonLabel = useMemo(() => {
    if (completedPlan === 'basic') {
      return 'Plan updated';
    }
    if (pendingPlan === 'basic') {
      return 'Opening Shopify…';
    }
    if (isCurrentBasic) {
      return 'Current plan';
    }
    if (billingStatus === 'pending') {
      return 'Approve in Shopify…';
    }
    return 'Subscribe with Shopify';
  }, [billingStatus, completedPlan, isCurrentBasic, pendingPlan]);

  const businessButtonLabel = useMemo(() => {
    const pendingKey: PendingPlanKey = `business:${selectedTier.id}`;
    if (completedPlan === pendingKey) {
      return 'Plan updated';
    }
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
  }, [billingStatus, completedPlan, isCurrentBusinessTier, pendingPlan, selectedTier.id]);

  const refreshHint = useMemo(
    () => (isFetching ? 'Syncing usage with Shopify…' : null),
    [isFetching],
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8 pe-page-enter">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Plans</h1>
        <p className="text-muted-foreground mt-1">
          Impressions include manual campaigns and automation sends. Limits reset on the 1st of each
          month.
          {refreshHint ? ` ${refreshHint}` : ''}
        </p>
      </div>

      <ImpressionUsageBar />

      {billingStatus === 'pending' ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          Shopify billing approval is pending. Click Subscribe again to open the charge approval page,
          then return here after you approve.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 items-stretch">
        <PlanCard
          title="Basic"
          description="Free — perfect to get started"
          price="$0"
          priceSuffix="/mo"
          features={BASIC_FEATURES}
          active={isCurrentBasic}
          footer={
            <Button
              className={cn(
                'w-full pe-pressable transition-colors',
                completedPlan === 'basic' && 'bg-emerald-600 text-white hover:bg-emerald-600/90',
              )}
              variant={isCurrentBasic || completedPlan === 'basic' ? 'secondary' : 'default'}
              disabled={isCurrentBasic || pendingPlan === 'basic'}
              onClick={handleSubscribeBasic}
            >
              {basicButtonLabel}
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            {BASIC_PLAN.impressions.toLocaleString()} impressions per month
          </p>
        </PlanCard>

        <PlanCard
          title="Business"
          description="Scale with higher monthly limits"
          price={`$${selectedTier.priceUsd}`}
          priceSuffix="/mo"
          features={BUSINESS_FEATURES}
          active={isCurrentBusinessTier(selectedTier.id)}
          footer={
            <Button
              className={cn(
                'w-full pe-pressable transition-colors',
                completedPlan === `business:${selectedTier.id}` &&
                  'bg-emerald-600 text-white hover:bg-emerald-600/90',
              )}
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
          <Slider
            value={[tierIndex]}
            max={BUSINESS_TIERS.length - 1}
            step={1}
            onValueChange={(value) => setTierIndex(value[0] ?? 0)}
          />
          <p className="text-sm font-medium">
            {selectedTier.impressions.toLocaleString()} impressions / month
          </p>
        </PlanCard>

        <PlanCard
          title="Enterprise"
          description="Custom volume and terms"
          price="Custom"
          features={ENTERPRISE_FEATURES}
          active={currentPlanKey === 'enterprise'}
          footer={
            <Button size="lg" variant="outline" className="w-full pe-pressable" asChild>
              <a href="mailto:support@push-eagle.com">
                <Mail className="mr-2 h-5 w-5" />
                Contact for pricing
              </a>
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Need more than 1M impressions or custom billing? We will tailor a plan for your store.
          </p>
        </PlanCard>
      </div>
    </div>
  );
}
