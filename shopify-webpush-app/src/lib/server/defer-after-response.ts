import { waitUntil } from '@vercel/functions';

type DeferredTask = () => Promise<unknown>;

const logDeferredError = (error: unknown) => {
  console.error('[deferAfterResponse]', error);
};

/**
 * Runs work after the HTTP response is sent (Vercel waitUntil).
 */
export const deferAfterResponse = (task: DeferredTask): void => {
  const promise = Promise.resolve().then(task).catch(logDeferredError);
  waitUntil(promise);
};
