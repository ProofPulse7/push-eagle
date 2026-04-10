
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubscriberKpis } from '@/components/subscribers/subscriber-kpis';
import { SubscribersTable } from '@/components/subscribers/subscribers-table';
import { GeolocationChart } from '@/components/subscribers/geolocation-chart';
import { SubscriberGrowthChart } from '@/components/dashboard/subscriber-growth-chart';
import { SubscriberBreakdown } from '@/components/subscribers/subscriber-breakdown';

export default function SubscribersPage() {
  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Subscribers</h1>
          <p className="text-muted-foreground">Manage and analyze your subscriber base.</p>
        </div>
      </div>

      <SubscriberKpis />

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="list">Subscriber List</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
            <div className="mt-4 grid gap-8 grid-cols-1 lg:grid-cols-2 items-start">
                <SubscriberBreakdown />
                <GeolocationChart />
            </div>
             <div className="mt-8">
                <SubscriberGrowthChart showDatePicker={true} />
            </div>
        </TabsContent>
        <TabsContent value="list">
            <Card className="mt-4">
              <CardHeader>
                  <CardTitle>List of subscribers</CardTitle>
              </CardHeader>
              <CardContent>
                <SubscribersTable />
              </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
