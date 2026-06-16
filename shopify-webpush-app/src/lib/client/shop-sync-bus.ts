export type ShopSyncEvent =
  | { type: 'campaigns' }
  | { type: 'subscribers' }
  | { type: 'dashboard' }
  | { type: 'all' };

type ShopSyncMessage = ShopSyncEvent & { ts: number };

const channelName = (shop: string) => `pe-shop-sync:${shop.trim().toLowerCase()}`;

export const broadcastShopSync = (shop: string, event: ShopSyncEvent) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  const message: ShopSyncMessage = { ...event, ts: Date.now() };

  try {
    const channel = new BroadcastChannel(channelName(shop));
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unavailable — polling still keeps tabs fresh.
  }
};

export const subscribeShopSync = (
  shop: string,
  handler: (event: ShopSyncMessage) => void,
) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return () => undefined;
  }

  try {
    const channel = new BroadcastChannel(channelName(shop));
    channel.onmessage = (event) => {
      if (event.data && typeof event.data === 'object') {
        handler(event.data as ShopSyncMessage);
      }
    };
    return () => channel.close();
  } catch {
    return () => undefined;
  }
};
