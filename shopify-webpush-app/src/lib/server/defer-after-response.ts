type DeferredTask = () => Promise<unknown>;

const logDeferredError = (error: unknown) => {
  console.error('[deferAfterResponse]', error);
};

/**
 * Runs work after the HTTP response is sent (Vercel waitUntil).
 * Falls back to fire-and-forget locally when waitUntil is unavailable.
 */
export const deferAfterResponse = (task: DeferredTask): void => {
  const promise = Promise.resolve().then(task).catch(logDeferredError);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { waitUntil } = require('@vercel/functions') as {
      waitUntil: (promise: Promise<unknown>) => void;
    };
    waitUntil(promise);
  } catch {
    void promise;
  }
};
