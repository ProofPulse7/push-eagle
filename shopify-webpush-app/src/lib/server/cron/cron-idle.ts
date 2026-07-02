import { deleteKvKey, isCloudflareKvEnabled, readKvJson, writeKvJson } from '@/lib/server/cache/cloudflare-kv';

const CRON_SLEEP_KV_KEY = 'pe:cron:sleep_until_iso';
const CRON_PROBE_CACHE_KEY = 'pe:cron:probe_idle_cache_v1';

export const readCronSleepUntil = async (): Promise<Date | null> => {
  if (!isCloudflareKvEnabled()) {
    return null;
  }

  try {
    const raw = await readKvJson<{ until?: string } | string>(CRON_SLEEP_KV_KEY);
    const iso =
      typeof raw === 'string'
        ? raw
        : typeof raw?.until === 'string'
          ? raw.until
          : null;
    if (!iso) {
      return null;
    }
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  } catch {
    return null;
  }
};

export const writeCronSleepUntil = async (until: Date) => {
  if (!isCloudflareKvEnabled()) {
    return;
  }

  void writeKvJson(CRON_SLEEP_KV_KEY, { until: until.toISOString() }, 86_400).catch((error) => {
    console.error('[cron-idle] failed to write sleep marker', error);
  });
};

export const clearCronSleep = async () => {
  if (!isCloudflareKvEnabled()) {
    return;
  }

  try {
    await deleteKvKey(CRON_SLEEP_KV_KEY);
    await deleteKvKey(CRON_PROBE_CACHE_KEY);
  } catch (error) {
    console.error('[cron-idle] failed to clear sleep marker', error);
  }
};

export const bumpCronWakeNow = async () => {
  await clearCronSleep();
};

export const CRON_SLEEP_KV_KEY_EXPORT = CRON_SLEEP_KV_KEY;
