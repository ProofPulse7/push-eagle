'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { LEGAL_LINKS } from '@/lib/client/legal-links';

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
  alternateHref?: string;
  alternateLabel?: string;
};

export function LegalPageShell({
  eyebrow,
  title,
  updated,
  children,
  alternateHref,
  alternateLabel,
}: LegalPageShellProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/dashboard');
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/50 via-background to-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {alternateHref && alternateLabel ? (
            <Link href={alternateHref} className="text-sm font-medium text-primary hover:underline">
              {alternateLabel}
            </Link>
          ) : null}
        </div>

        <header className="mb-10 overflow-hidden rounded-3xl border border-border/70 bg-card px-6 py-10 shadow-sm sm:px-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: {updated}</p>
        </header>

        <article className="rounded-3xl border border-border/70 bg-card px-6 py-8 shadow-sm sm:px-10 sm:py-10">
          <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-a:text-primary">
            {children}
          </div>
        </article>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          <p>
            <Link href={LEGAL_LINKS.privacyPolicy} className="underline underline-offset-2">
              Privacy policy
            </Link>
            {' · '}
            <Link href={LEGAL_LINKS.termsOfService} className="underline underline-offset-2">
              Terms of service
            </Link>
            {' · '}
            <a href={LEGAL_LINKS.supportEmail} className="underline underline-offset-2">
              Support
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
