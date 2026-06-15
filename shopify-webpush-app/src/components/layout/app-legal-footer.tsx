import Link from 'next/link';

import { LEGAL_LINKS } from '@/lib/client/legal-links';

export function AppLegalFooter() {
  return (
    <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground sm:px-6 md:px-8">
      <p>
        Push Eagle processes store and subscriber data to deliver web push notifications.{' '}
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
  );
}
