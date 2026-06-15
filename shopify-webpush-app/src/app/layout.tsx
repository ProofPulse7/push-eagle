import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AppLayout } from '@/components/layout/app-layout';
import { ThemeProvider } from '@/components/theme-provider';
import { FirebaseClientInit } from '@/components/firebase/firebase-client-init';
import { SettingsProvider } from '@/context/settings-context';
import { AppBootstrapLoader } from '@/components/providers/app-bootstrap-loader';
import { AppSetupGate } from '@/components/providers/app-setup-gate';
import { QueryProvider } from '@/components/providers/query-provider';
import { SettingsCacheSync } from '@/components/providers/settings-cache-sync';
import { ShopifyEmbeddedAuthBootstrap } from '@/components/providers/shopify-embedded-provider';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

const shopifyApiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY || '';

export const metadata: Metadata = {
  title: 'Push Eagle',
  description: 'Shopify web push notifications, campaigns, automations, and analytics.',
  manifest: '/manifest.webmanifest',
  other: {
    'mobile-web-app-capable': 'yes',
    ...(shopifyApiKey ? { 'shopify-api-key': shopifyApiKey } : {}),
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Push Eagle',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#111111',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {shopifyApiKey ? <meta name="shopify-api-key" content={shopifyApiKey} /> : null}
      </head>
      <body className={`${inter.variable} font-body antialiased bg-background`}>
        {shopifyApiKey ? (
          <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="afterInteractive" />
        ) : null}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <SettingsProvider>
              <Suspense fallback={null}>
                <ShopifyEmbeddedAuthBootstrap />
              </Suspense>
              <AppSetupGate>
                <AppBootstrapLoader>
                  <SettingsCacheSync />
                  <FirebaseClientInit />
                  <AppLayout>{children}</AppLayout>
                  <Toaster />
                </AppBootstrapLoader>
              </AppSetupGate>
            </SettingsProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
