
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AppLayout } from '@/components/layout/app-layout';
import { ThemeProvider } from '@/components/theme-provider';
import { FirebaseClientInit } from '@/components/firebase/firebase-client-init';
import { SettingsProvider } from '@/context/settings-context';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'EaglePush',
  description: 'The ultimate push notification platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-body antialiased bg-background`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>
            <FirebaseClientInit />
            <AppLayout>{children}</AppLayout>
            <Toaster />
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
