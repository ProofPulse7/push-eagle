import { deleteKvKey, isCloudflareKvEnabled, readKvJson, writeKvJson } from '@/lib/server/cache/cloudflare-kv';

const CRON_SLEEP_KV_KEY = 'pe:cron:sleep_until_iso';
const CRON_PROBE_CACHE_KEY = 'pe:cron:probe_idle_cache_v1';
const CRON_OUTBOX_EMPTY_KEY = 'pe:cron:audience_outbox_empty_v1';

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
    // Only clear the sleep marker. Keep probe/outbox idle caches so the next
    // tick can re-sleep without a Neon campaign EXISTS probe after soft wakes.
    await deleteKvKey(CRON_SLEEP_KV_KEY);
  } catch (error) {
    console.error('[cron-idle] failed to clear sleep marker', error);
  }
};

export const bumpCronWakeNow = async () => {
  await clearCronSleep();
};

/**
 * Soft wake for delayed automation jobs. When the Cloudflare queue is enabled,
 * delayed jobs are delivered by the queue consumer — clearing cron sleep on every
 * enqueue keeps Neon awake and burns free-plan compute. Instead:
 * - due within ~3 minutes → clear sleep (immediate / near-term work)
 * - due later → shorten sleep to dueAt+90s so a missed queue message is still
 *   picked up promptly, without waking Neon for the whole delay window
 * - queue disabled → always clear sleep (cron is the only delivery path)
 */
export const bumpCronWakeForDueAt = async (dueAt: Date) => {
  const { isAutomationQueueEnabled } = await import('@/lib/server/automation/queue-scheduler');
  if (!isAutomationQueueEnabled()) {
    await clearCronSleep();
    return;
  }

  const msUntilDue = dueAt.getTime() - Date.now();
  if (msUntilDue <= 3 * 60 * 1000) {
    await clearCronSleep();
    return;
  }

  if (!isCloudflareKvEnabled()) {
    return;
  }

  const safetyWake = new Date(dueAt.getTime() + 90 * 1000);
  try {
    const current = await readCronSleepUntil();
    if (!current || current.getTime() > safetyWake.getTime()) {
      await writeCronSleepUntil(safetyWake);
    }
  } catch {
    // best-effort; queue remains primary delivery
  }
};

export const peekCronIdleCaches = async (): Promise<{
  canSleepWithoutNeon: boolean;
  probe: {
    dueScheduledCampaigns: number;
    queuedCampaigns: number;
    sendingCampaigns: number;
    dueAutomationJobs: number;
    promoteableAutomationJobs: number;
    dueIngestionJobs: number;
    nextWakeAt: Date | null;
  } | null;
}> => {
  if (!isCloudflareKvEnabled()) {
    return { canSleepWithoutNeon: false, probe: null };
  }

  try {
    const [probeCached, outboxEmpty] = await Promise.all([
      readKvJson<{
        probe: {
          dueScheduledCampaigns: number;
          queuedCampaigns: number;
          sendingCampaigns: number;
          dueAutomationJobs: number;
          promoteableAutomationJobs: number;
          dueIngestionJobs: number;
          nextWakeAt: string | Date | null;
        };
        cachedAt: number;
      }>(CRON_PROBE_CACHE_KEY),
      readKvJson<{ empty: true; at: number }>(CRON_OUTBOX_EMPTY_KEY),
    ]);

    const IDLE_CACHE_FRESH_MS = 4 * 60 * 60 * 1000;
    const probeFresh =
      probeCached?.probe
      && typeof probeCached.cachedAt === 'number'
      && Date.now() - probeCached.cachedAt < IDLE_CACHE_FRESH_MS;
    const outboxFresh =
      outboxEmpty?.empty
      && typeof outboxEmpty.at === 'number'
      && Date.now() - outboxEmpty.at < IDLE_CACHE_FRESH_MS;

    if (!probeFresh || !outboxFresh) {
      return { canSleepWithoutNeon: false, probe: null };
    }

    const nextWakeRaw = probeCached.probe.nextWakeAt;
    const probe = {
      ...probeCached.probe,
      nextWakeAt:
        nextWakeRaw instanceof Date
          ? nextWakeRaw
          : nextWakeRaw
            ? new Date(String(nextWakeRaw))
            : null,
    };

    const hasWork =
      probe.dueScheduledCampaigns
      + probe.queuedCampaigns
      + probe.sendingCampaigns
      + probe.dueAutomationJobs
      + probe.dueIngestionJobs
      > 0;

    return {
      canSleepWithoutNeon: !hasWork,
      probe,
    };
  } catch {
    return { canSleepWithoutNeon: false, probe: null };
  }
};

const OUTBOX_EMPTY_TTL_SECONDS = 4 * 60 * 60;

export const markCronOutboxEmpty = async () => {
  if (!isCloudflareKvEnabled()) {
    return;
  }
  void writeKvJson(CRON_OUTBOX_EMPTY_KEY, { empty: true as const, at: Date.now() }, OUTBOX_EMPTY_TTL_SECONDS).catch(
    () => undefined,
  );
};

export const clearCronOutboxEmptyCache = async () => {
  if (!isCloudflareKvEnabled()) {
    return;
  }
  void deleteKvKey(CRON_OUTBOX_EMPTY_KEY).catch(() => undefined);
};

export const CRON_SLEEP_KV_KEY_EXPORT = CRON_SLEEP_KV_KEY;
export const CRON_OUTBOX_EMPTY_KEY_EXPORT = CRON_OUTBOX_EMPTY_KEY;
export const CRON_OUTBOX_EMPTY_TTL_SECONDS = OUTBOX_EMPTY_TTL_SECONDS;
