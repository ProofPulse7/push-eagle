'use client';

import Link from 'next/link';
import { ArrowLeft, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function WinBackPage() {
  return (
    <div className="flex min-h-screen flex-col gap-6 bg-muted/40 p-4 sm:p-6 md:p-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/automations">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to Automations</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Win-back</h1>
          <p className="text-muted-foreground">Re-engage buyers after a cooling-off window following their last purchase.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <RefreshCcw className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Flow outline</CardTitle>
              <CardDescription>Triggered from order history when no newer purchase arrives inside the delay window.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Source signals: Shopify orders.</p>
          <p>Default delay: 7 days after the order event.</p>
          <p>Suppression: the job is skipped automatically if a newer order arrives before send time.</p>
        </CardContent>
      </Card>
    </div>
  );
}