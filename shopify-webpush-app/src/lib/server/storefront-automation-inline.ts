import { isAutomationQueueEnabled } from '@/lib/server/automation/queue-scheduler';

/**
 * Storefront bootstrap/activity must not run automation workers inline when the
 * queue + cron safety net are enabled — that duplicates work on every page view.
 */
export const shouldRunStorefrontAutomationInline = () => !isAutomationQueueEnabled();
