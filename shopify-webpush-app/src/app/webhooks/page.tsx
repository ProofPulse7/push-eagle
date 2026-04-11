'use client';

import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/settings-context';

type WebhookEvent = {
  topic: string;
  event_id: string;
  received_at: string;
};

export default function WebhooksPage() {
  const { shopDomain } = useSettings();
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    if (!shopDomain) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/webhooks/events?shop=${encodeURIComponent(shopDomain)}&limit=100`);
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        setError(data?.error || 'Failed to load webhook events.');
        return;
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setError('Failed to load webhook events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, [shopDomain]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Webhook Audit</h1>
        <Button variant="outline" size="sm" onClick={() => void loadEvents()} disabled={loading || !shopDomain}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!shopDomain && <p className="text-sm text-muted-foreground">Open from Shopify so shop context is available.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {shopDomain && !error && events.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">No webhook events yet for this store.</p>
          )}
          {events.map((event) => (
            <div key={`${event.topic}-${event.event_id}`} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="secondary">{event.topic}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(event.received_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground break-all">{event.event_id}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
