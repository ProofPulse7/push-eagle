'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useThemeEmbedStatus } from '@/hooks/queries/use-app-queries';

export function ThemeExtensionWarningBanner() {
  const { data } = useThemeEmbedStatus();
  const themeEditorUrl = data?.themeEditorUrl;

  if (!data?.ok || !data.checkAvailable || data.enabled || !themeEditorUrl) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-sm">
      <div className="flex items-center gap-2 bg-amber-400 px-4 py-2.5 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Push Eagle isn&apos;t connected to your store yet
      </div>
      <div className="space-y-4 bg-background px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Your store isn&apos;t collecting subscribers yet. Enable Push Eagle in your theme App embeds,
          then click Save. Push Eagle opens with the extension ready to turn on.
        </p>
        <Button variant="outline" asChild>
          <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Enable Push Eagle
          </a>
        </Button>
      </div>
    </div>
  );
}
