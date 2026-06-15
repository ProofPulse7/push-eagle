'use client';

import { BACKGROUND_SAVE_DEBOUNCE_MS, runWithBackgroundRetries } from '@/lib/client/background-save';

type SaveTask<TPayload> = {
  key: string;
  payload: TPayload;
  save: (payload: TPayload) => Promise<void>;
  onError?: (error: unknown) => void;
};

export class OptimisticSaveQueue<TPayload> {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inflight = new Map<string, Promise<void>>();
  private latestPayload = new Map<string, TPayload>();

  enqueue(task: SaveTask<TPayload>, debounceMs = BACKGROUND_SAVE_DEBOUNCE_MS) {
    this.latestPayload.set(task.key, task.payload);

    const existingTimer = this.timers.get(task.key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.timers.delete(task.key);
      void this.flush(task.key, task.save, task.onError);
    }, debounceMs);

    this.timers.set(task.key, timer);
  }

  private async flush(
    key: string,
    save: (payload: TPayload) => Promise<void>,
    onError?: (error: unknown) => void,
  ) {
    const payload = this.latestPayload.get(key);
    if (!payload) {
      return;
    }

    const previous = this.inflight.get(key);
    if (previous) {
      try {
        await previous;
      } catch {
        // Latest payload wins; ignore stale failures.
      }
    }

    const run = runWithBackgroundRetries(() => save(payload))
      .catch((error) => {
        onError?.(error);
      })
      .finally(() => {
        if (this.inflight.get(key) === run) {
          this.inflight.delete(key);
        }
      });

    this.inflight.set(key, run);
    await run;
  }
}
