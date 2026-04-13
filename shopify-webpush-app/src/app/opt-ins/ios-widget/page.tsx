'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Book, ChevronLeft, ChevronRight, Loader2, RefreshCw, Share, Smile, Square, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/hooks/use-toast';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type IOSWidgetSettingsResponse = {
  ok: boolean;
  iosWidgetEnabled: boolean;
  iosWidgetTitle: string;
  iosWidgetMessage: string;
  error?: string;
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 25000) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const ShareIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M13 6.5V1h-2v5.5L7.9 3.4 6.5 4.8l5.5 5.5 5.5-5.5-1.4-1.4L13 6.5zM18 9v9H6V9H4v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9h-2z" />
  </svg>
);

const IOSWidgetPreview = ({ enabled, title, message, storeUrl }: { enabled: boolean; title: string; message: string; storeUrl: string }) => {
  const renderMessage = (text: string) => {
    const parts = text.split(/(\{\{share icon\}\})/g);
    return parts.map((part, index) => {
      if (part === '{{share icon}}') {
        return <ShareIcon key={index} className="inline-block h-4 w-4 align-text-bottom text-blue-500" />;
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="w-full max-w-sm mx-auto font-sans">
      <div className="bg-gray-100 dark:bg-gray-900/50 rounded-xl shadow-lg border relative overflow-hidden">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
          {enabled ? (
            <div className="absolute top-4 left-4 right-4 bg-gray-900/90 text-white rounded-2xl shadow-2xl p-4 backdrop-blur-sm z-10 border border-white/10">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-semibold text-sm leading-tight">{title || 'Get notifications on your iPhone or iPad'}</h3>
                  <p className="text-sm mt-2 text-gray-200 leading-relaxed">
                    {message ? renderMessage(message) : "Add this store to your Home Screen. We'll ask for notification permission once you open it from there."}
                  </p>
                </div>
                <button className="text-gray-400 hover:text-white" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">iOS only</span>
                <Button size="sm" className="h-8 rounded-full bg-white text-gray-900 hover:bg-white/90">I've added it</Button>
              </div>
            </div>
          ) : (
            <div className="absolute top-4 left-4 right-4 rounded-2xl border border-dashed border-gray-300 bg-white/90 p-4 text-sm text-gray-500 shadow-sm">
              The iOS Home Screen widget is turned off.
            </div>
          )}

          <div className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 p-2 rounded-lg">
            <span className="text-xs font-serif">AA</span>
            <div className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs rounded-md p-1.5 flex items-center justify-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>{storeUrl || 'your-store.myshopify.com'}</span>
            </div>
            <RefreshCw className="h-4 w-4" />
          </div>

          <div className="h-48 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-800 rounded-md mt-2" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-3 pt-2 bg-gray-200/85 dark:bg-gray-900/80 backdrop-blur-sm border-t border-gray-300/50 dark:border-gray-700/50">
          <div className="flex items-center justify-between text-blue-500">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 dark:text-gray-600"><ChevronLeft className="h-6 w-6" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 dark:text-gray-600" disabled><ChevronRight className="h-6 w-6" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-500"><ShareIcon className="h-6 w-6" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-500"><Book className="h-6 w-6" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-500"><Square className="h-5 w-5" /></Button>
          </div>
          <div className="w-32 h-1 bg-black rounded-full mx-auto mt-2" />
        </div>
      </div>
    </div>
  );
};

export default function IOSWidgetPage() {
  const { shopDomain, storeUrl } = useSettings();
  const { toast } = useToast();
  const loadedShopRef = useRef<string | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState('Get notifications on your iPhone or iPad');
  const [message, setMessage] = useState("Add this store to your Home Screen. Then open it from there and we'll ask for notification permission using your saved opt-in settings. Tap {{share icon}} and choose 'Add to Home Screen'.");
  const [resolvedShopDomain, setResolvedShopDomain] = useState('');
  const [queryShopDomain, setQueryShopDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const normalizeShopDomain = (value: string) => value.trim().toLowerCase();
  const isValidShopDomain = (value: string) => value.endsWith('.myshopify.com');

  useEffect(() => {
    const fromQuery = normalizeShopDomain(new URLSearchParams(window.location.search).get('shop') || '');
    setQueryShopDomain(fromQuery);
  }, []);

  useEffect(() => {
    const fromContext = normalizeShopDomain(shopDomain || '');
    const fromStorage = normalizeShopDomain(localStorage.getItem('shopDomain') || '');
    const candidate = [fromContext, queryShopDomain, fromStorage].find((value) => value && isValidShopDomain(value)) || '';
    setResolvedShopDomain(candidate);
  }, [queryShopDomain, shopDomain]);

  useEffect(() => {
    setLoadError(null);

    if (!resolvedShopDomain) {
      setLoading(false);
      setLoadError('Missing Shopify shop context. Re-open the app from Shopify Admin so the shop parameter is available.');
      return;
    }

    if (loadedShopRef.current === resolvedShopDomain) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetchWithTimeout(`/api/settings/opt-in?shop=${encodeURIComponent(resolvedShopDomain)}`)
      .then(async (res) => {
        const data = (await res.json()) as IOSWidgetSettingsResponse;
        if (!res.ok || !data?.ok || !isMounted) {
          throw new Error(data?.error ?? 'Failed to load iOS widget settings.');
        }

        setEnabled(Boolean(data.iosWidgetEnabled));
        setTitle(data.iosWidgetTitle);
        setMessage(data.iosWidgetMessage);
        loadedShopRef.current = resolvedShopDomain;
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        const nextMessage = error instanceof Error
          ? (error.name === 'AbortError' ? 'Loading settings timed out. Please refresh and try again.' : error.message)
          : 'Unexpected error while loading iOS widget settings.';
        setLoadError(nextMessage);
        toast({
          variant: 'destructive',
          title: 'Failed to load iOS widget settings',
          description: nextMessage,
        });
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [resolvedShopDomain, toast]);

  const saveChanges = async () => {
    if (!resolvedShopDomain) {
      const nextMessage = 'Open the dashboard from a connected Shopify store before saving iOS widget settings.';
      setSaveStatus({ type: 'error', message: nextMessage });
      toast({
        variant: 'destructive',
        title: 'Shop domain required',
        description: nextMessage,
      });
      return;
    }

    setSaving(true);
    setSaveStatus(null);

    try {
      const response = await fetchWithTimeout('/api/settings/opt-in', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopDomain: resolvedShopDomain,
          iosWidgetEnabled: enabled,
          iosWidgetTitle: title,
          iosWidgetMessage: message,
        }),
      });

      const raw = await response.text();
      const result = (raw ? JSON.parse(raw) : {}) as IOSWidgetSettingsResponse;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? 'Failed to save iOS widget settings.');
      }

      const savedAt = new Date().toLocaleTimeString();
      const nextMessage = `iOS widget settings saved successfully at ${savedAt}.`;
      setSaveStatus({ type: 'success', message: nextMessage });
      toast({
        title: 'iOS widget saved',
        description: 'The storefront will use this Home Screen onboarding copy for iPhone and iPad visitors.',
      });
    } catch (error) {
      const nextMessage = error instanceof Error
        ? (error.name === 'AbortError' ? 'Save request timed out. Please try again.' : error.message)
        : 'Unexpected error while saving iOS widget settings.';
      setSaveStatus({ type: 'error', message: nextMessage });
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: nextMessage,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMessageEmojiSelect = (emoji: { emoji: string }) => {
    setMessage((prev) => prev + emoji.emoji);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8 min-h-screen">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/opt-ins">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to Opt-ins</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">iOS widget</h1>
          <p className="text-sm text-muted-foreground mt-1">Shown only on iPhone and iPad before the visitor opens the store from Home Screen.</p>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load saved settings: {loadError}
        </div>
      ) : null}

      {saveStatus ? (
        <div className={`rounded-md border px-4 py-3 text-sm ${saveStatus.type === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
          {saveStatus.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>
              Keep the message short and instructional. On iOS, permission must only be requested after the store is opened as a Home Screen web app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-3 rounded-xl border p-4">
              <Checkbox id="ios-widget-enabled" checked={enabled} onCheckedChange={(checked) => setEnabled(Boolean(checked))} className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor="ios-widget-enabled" className="text-base font-semibold cursor-pointer">Enable iOS Home Screen onboarding</Label>
                <p className="text-sm text-muted-foreground">When enabled, iPhone and iPad visitors see this widget until the store opens in standalone Home Screen mode.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={loading} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <div className="relative">
                <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[140px] pr-10" disabled={loading} />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-8 w-8 text-muted-foreground" disabled={loading}>
                      <Smile className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-0">
                    <EmojiPicker onEmojiClick={handleMessageEmojiSelect} />
                  </PopoverContent>
                </Popover>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                Type {'{{share icon}}'} to include the <ShareIcon className="inline-block h-3.5 w-3.5" /> share icon in the copy.
              </p>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Runtime behavior</p>
              <p>The storefront checks Home Screen mode on iOS at load time and while the iOS widget is visible.</p>
              <p>Once standalone mode is confirmed, Push Eagle records that confirmation for the visitor and then continues with the saved browser or custom prompt rules.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Preview of the iPhone/iPad onboarding widget before notification permission is requested.</CardDescription>
          </CardHeader>
          <CardContent>
            <IOSWidgetPreview enabled={enabled} title={title} message={message} storeUrl={storeUrl} />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2 mt-auto">
        <Button variant="outline" asChild>
          <Link href="/opt-ins">Cancel</Link>
        </Button>
        <Button onClick={saveChanges} disabled={loading || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {loading ? 'Loading...' : saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}