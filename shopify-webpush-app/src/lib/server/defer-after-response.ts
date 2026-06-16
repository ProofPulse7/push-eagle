type DeferredTask = () => Promise<unknown>;

const logDeferredError = (error: unknown) => {
  console.error('[deferAfterResponse]', error);
};

/**
 * Runs work after the HTTP response is sent (Vercel waitUntil / Next after).
 * Falls back to fire-and-forget locally when neither is available.
 */
export const deferAfterResponse = (task: DeferredTask): void => {
  const promise = Promise.resolve().then(task).catch(logDeferredError);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { waitUntil } = require('@vercel/functions') as {
      waitUntil: (promise: Promise<unknown>) => void;
    };
    waitUntil(promise);
    return;
  } catch {
    // continue to Next.js after()
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { after } = require('next/server') as {
      after: (task: () => void | Promise<void>) => void;
    };
    after(() => promise);
    return;
  } catch {
    void promise;
  }
};

export const runAfterResponse = deferAfterResponse;
