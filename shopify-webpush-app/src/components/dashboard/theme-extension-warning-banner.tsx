'use client';

import { useEffect } from 'react';
import { AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useThemeEmbedStatus } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { queryKeys } from '@/lib/client/query-keys';

export function ThemeExtensionWarningBanner() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const { data, isFetching } = useThemeEmbedStatus();
  const themeEditorUrl = data?.themeEditorUrl;

  useEffect(() => {
    if (!shop) {
      return;
    }

    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.themeEmbedStatus(shop) });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };

    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queryClient, shop]);

  if (!data?.ok || !data.checkAvailable || data.enabled || !themeEditorUrl) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-amber-300/70 bg-white shadow-[0_8px_30px_rgba(251,191,36,0.18)]">
      <div className="flex items-center gap-2.5 bg-amber-400 px-4 py-3 sm:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10">
          <AlertTriangle className="h-4 w-4 text-black" aria-hidden />
        </span>
        <p className="text-sm font-semibold tracking-tight text-black sm:text-[15px]">
          Push Eagle isn&apos;t connected to your store yet
        </p>
      </div>

      <div className="space-y-4 bg-white px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-sm leading-relaxed text-slate-600">
            Your store isn&apos;t collecting subscribers yet. Enable Push Eagle in your theme{' '}
            <span className="font-medium text-slate-800">App embeds</span>, then click{' '}
            <span className="font-medium text-slate-800">Save</span>. This banner disappears as
            soon as the embed is active.
            {isFetching ? (
              <span className="ml-1 text-xs text-violet-600">Checking status…</span>
            ) : null}
          </p>
        </div>

        <Button
          asChild
          className="h-10 rounded-lg bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 focus-visible:ring-violet-600"
        >
          <a href={themeEditorUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Enable Push Eagle
          </a>
        </Button>
      </div>
    </div>
  );
}
