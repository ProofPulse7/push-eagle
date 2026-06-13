import { env } from '@/lib/config/env';

export const isCronAuthorized = (request: Request) => {
  const vercelCronHeader = (request.headers.get('x-vercel-cron') ?? '').trim().toLowerCase();
  const userAgent = (request.headers.get('user-agent') ?? '').toLowerCase();
  if (vercelCronHeader === '1' || vercelCronHeader === 'true' || userAgent.includes('vercel-cron')) {
    return true;
  }

  if (!env.CRON_SECRET) {
    return false;
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const xSecret = request.headers.get('x-automation-secret') ?? '';
  const querySecret = new URL(request.url).searchParams.get('secret') ?? '';
  return bearer === env.CRON_SECRET || xSecret === env.CRON_SECRET || querySecret === env.CRON_SECRET;
};

export const parsePositiveInt = (
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export type CronTickConfig = {
  campaignShards: number;
  automationShards: number;
  ingestionShards: number;
  maxCampaigns: number;
  maxBatches: number;
  maxAutomationJobs: number;
  maxAutomationConcurrent: number;
  maxIngestionJobs: number;
  maxIngestionConcurrent: number;
};

export const parseCronTickConfig = (searchParams: URLSearchParams): CronTickConfig => ({
  campaignShards: parsePositiveInt(searchParams.get('campaignShards'), 4, 1, 64),
  automationShards: parsePositiveInt(searchParams.get('automationShards'), 6, 1, 64),
  ingestionShards: parsePositiveInt(searchParams.get('ingestionShards'), 4, 1, 64),
  maxCampaigns: parsePositiveInt(searchParams.get('maxCampaigns'), 25, 1, 250),
  maxBatches: parsePositiveInt(searchParams.get('maxBatches'), 20, 1, 2000),
  maxAutomationJobs: parsePositiveInt(searchParams.get('maxAutomationJobs'), 200, 1, 2000),
  maxAutomationConcurrent: parsePositiveInt(searchParams.get('maxAutomationConcurrent'), 80, 1, 200),
  maxIngestionJobs: parsePositiveInt(searchParams.get('maxIngestionJobs'), 1000, 1, 5000),
  maxIngestionConcurrent: parsePositiveInt(searchParams.get('maxIngestionConcurrent'), 100, 1, 200),
});
