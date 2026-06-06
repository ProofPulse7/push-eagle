'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Check, Info, Loader2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSINESS_TIERS, BASIC_PLAN } from '@/lib/client/billing-plans';
import { useBillingStatus, useConfirmBilling, useSubscribePlan } from '@/hooks/queries/use-billing';
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

export function PlansPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { data, isFetching } = useBillingStatus({ refetchOnMount: true });
  const subscribe = useSubscribePlan();
  const confirmBilling = useConfirmBilling();
  const [tierIndex, setTierIndex] = useState(0);

  const billing = (data?.billing ?? null) as Record<string, unknown> | null;
  const currentPlanKey = String(billing?.planKey ?? 'basic');
  const currentTierId = billing?.tierId ? String(billing.tierId) : null;

  const selectedTier = BUSINESS_TIERS[tierIndex] ?? BUSINESS_TIERS[0];

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
    if (searchParams.get('billing') !== 'return' || billingReturnHandled.current) {
      return;
    }
    billingReturnHandled.current = true;
    confirmBilling.mutate(undefined, {
      onSuccess: (result) => {
        if (result?.activated) {
          toast({ title: 'Plan activated', description: 'Your Business plan is now active.' });
        }
      },
      onError: () => {
        toast({
          variant: 'destructive',
          title: 'Billing confirmation pending',
          description: 'Complete approval in Shopify if you have not already.',
        });
      },
    });
  }, [searchParams, confirmBilling, toast]);

  const handleSubscribeBasic = () => {
    subscribe.mutate(
      { planKey: 'basic' },
      {
        onSuccess: () => {
          toast({ title: 'Basic plan active', description: 'You are on the free Basic plan.' });
        },
        onError: (error) => {
          toast({
            variant: 'destructive',
            title: 'Could not activate Basic',
            description: error instanceof Error ? error.message : 'Try again.',
          });
        },
      },
    );
  };

  const handleSubscribeBusiness = () => {
    subscribe.mutate(
      { planKey: 'business', tierId: selectedTier.id },
      {
        onSuccess: (result) => {
          if (result?.confirmationUrl) {
            const target = window.top ?? window;
            target.location.assign(result.confirmationUrl);
            return;
          }
          toast({ title: 'Business plan active', description: 'Your plan is ready to use.' });
        },
        onError: (error) => {
          toast({
            variant: 'destructive',
            title: 'Could not start checkout',
            description: error instanceof Error ? error.message : 'Try again.',
          });
        },
      },
    );
  };

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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 items-stretch">
        <PlanCard
          title="Basic"
          description="Free — perfect to get started"
          price="$0"
          priceSuffix="/mo"
          features={BASIC_FEATURES}
          active={currentPlanKey === 'basic'}
          footer={
            <Button
              className="w-full pe-pressable"
              variant={currentPlanKey === 'basic' ? 'secondary' : 'default'}
              disabled={currentPlanKey === 'basic' || subscribe.isPending}
              onClick={handleSubscribeBasic}
            >
              {currentPlanKey === 'basic'
                ? 'Current plan'
                : subscribe.isPending
                  ? 'Processing…'
                  : 'Subscribe free'}
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
          active={currentPlanKey === 'business'}
          footer={
            <Button
              className="w-full pe-pressable"
              disabled={
                (currentPlanKey === 'business' && currentTierId === selectedTier.id) ||
                subscribe.isPending
              }
              onClick={handleSubscribeBusiness}
            >
              {subscribe.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to Shopify…
                </>
              ) : currentPlanKey === 'business' && currentTierId === selectedTier.id ? (
                'Current plan'
              ) : (
                'Subscribe with Shopify'
              )}
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
