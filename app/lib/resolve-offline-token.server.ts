import { getOfflineAccessToken } from "./shopify-billing.server";
import { sessionStorage } from "../shopify.server";

export const loadOfflineAccessToken = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;

  try {
    const offlineSession = await sessionStorage.loadSession(offlineId);
    if (offlineSession?.accessToken && offlineSession.isOnline === false) {
      return offlineSession.accessToken;
    }
  } catch {
    // Fall back to database reads below.
  }

  return getOfflineAccessToken(shop);
};
