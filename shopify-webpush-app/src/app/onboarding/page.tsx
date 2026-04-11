import { env } from '@/lib/config/env';

type HealthPayload = {
  ok: boolean;
  services: {
    shopify: boolean;
    neon: boolean;
    supabase: boolean;
    firebaseClient: boolean;
  };
};

const statusText = (ok: boolean) => (ok ? 'Healthy' : 'Action required');

export default async function OnboardingPage() {
  let health: HealthPayload | null = null;

  try {
    const base = env.NEXT_PUBLIC_APP_URL;
    const response = await fetch(`${base}/api/integrations/health`, { cache: 'no-store' });
    if (response.ok) {
      health = (await response.json()) as HealthPayload;
    }
  } catch {
    health = null;
  }

  const shopifyOk = Boolean(health?.services.shopify);
  const dbOk = Boolean(health?.services.neon || health?.services.supabase);
  const firebaseOk = Boolean(health?.services.firebaseClient);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding Readiness</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Use this checklist to verify Shopify, database, Firebase, and storefront setup before launch.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Shopify credentials</p>
          <p className="text-sm text-muted-foreground mt-1">{statusText(shopifyOk)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Database connection</p>
          <p className="text-sm text-muted-foreground mt-1">{statusText(dbOk)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Firebase client config</p>
          <p className="text-sm text-muted-foreground mt-1">{statusText(firebaseOk)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">Storefront app proxy</p>
          <p className="text-sm text-muted-foreground mt-1">Verify in Shopify Partner dashboard</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <p className="text-sm font-medium">Required Shopify app proxy values</p>
        <p className="text-sm text-muted-foreground">Prefix: apps</p>
        <p className="text-sm text-muted-foreground">Subpath: push-eagle</p>
        <p className="text-sm text-muted-foreground">Proxy URL: {env.NEXT_PUBLIC_APP_URL}/api/storefront</p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <p className="text-sm font-medium">Theme block values</p>
        <p className="text-sm text-muted-foreground">Push Eagle app URL: {env.NEXT_PUBLIC_APP_URL}</p>
        <p className="text-sm text-muted-foreground">Bootstrap path: /apps/push-eagle/bootstrap</p>
        <p className="text-sm text-muted-foreground">Service worker path: /apps/push-eagle/sw.js</p>
      </div>
    </div>
  );
}