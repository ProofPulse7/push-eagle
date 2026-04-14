'use client';

import Link from 'next/link';
import { ArrowLeft, PackageCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function PostPurchaseFollowUpPage() {
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
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Post-purchase follow-up</h1>
          <p className="text-muted-foreground">Check in after an order and bring the shopper back with a follow-up push.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <PackageCheck className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Flow outline</CardTitle>
              <CardDescription>Triggered from the order webhook and queued for a short delay after purchase.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Source signals: Shopify orders.</p>
          <p>Default delay: 2 days after purchase.</p>
          <p>Intended use: check delivery progress, ask for a return visit, or route into a product discovery campaign.</p>
        </CardContent>
      </Card>
    </div>
  );
}