'use client';

import { ExternalLink, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildThemeAppEmbedDeepLink,
  PUSH_EAGLE_THEME_EMBED_NAME,
} from '@/lib/client/shopify-app-config';

type ThemeSetupCardProps = {
  shopDomain: string;
};

export function ThemeSetupCard({ shopDomain }: ThemeSetupCardProps) {
  const deepLink = buildThemeAppEmbedDeepLink(shopDomain);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-muted-foreground" />
          Storefront setup
        </CardTitle>
        <CardDescription>
          Enable the Push Eagle theme app embed so visitors can subscribe to web push notifications on
          your online store. No manual theme code edits are required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Open your theme editor and enable the <strong className="text-foreground">{PUSH_EAGLE_THEME_EMBED_NAME}</strong>{' '}
            app embed.
          </li>
          <li>Turn on <strong className="text-foreground">Enable opt-in prompt</strong> in the embed settings.</li>
          <li>
            Choose prompt position, delay, and copy. Push Eagle loads your logo and opt-in settings from
            this dashboard automatically.
          </li>
          <li>Click <strong className="text-foreground">Save</strong> in the theme editor, then visit your storefront to test.</li>
        </ol>

        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">App proxy</p>
          <p>
            Push Eagle uses the Shopify app proxy at <code className="text-xs">/apps/push-eagle</code>.
            This is configured automatically when you install the app — no extra setup is required.
          </p>
        </div>

        {deepLink ? (
          <Button asChild>
            <a href={deepLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Enable in theme editor
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open Push Eagle from Shopify Admin to generate your theme editor link.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
