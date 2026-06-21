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
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 bg-amber-400 px-4 py-2 text-sm font-semibold text-black">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Push Eagle isn&apos;t connected to your store yet
      </div>
      <div className="flex flex-col gap-3 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Your store isn&apos;t collecting subscribers yet. Enable Push Eagle in your theme App
          embeds, then click Save.
        </p>
        <Button
          asChild
          size="sm"
          className="shrink-0 bg-violet-600 text-white hover:bg-violet-700"
        >
          <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Enable Push Eagle
          </a>
        </Button>
      </div>
    </div>
  );
}
