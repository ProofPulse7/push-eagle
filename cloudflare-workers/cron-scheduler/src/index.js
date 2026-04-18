/**
 * Push Eagle Cron Scheduler - Cloudflare Worker
 *
 * Replaces Vercel cron jobs (which require Pro plan for sub-daily schedules).
 * Runs every 5 minutes on Cloudflare's free tier and triggers:
 *   1. Campaign processing  (/api/cron/process-campaigns)
 *   2. Automation processing (/api/cron/process-automations)
 *
 * Deploy:
 *   cd cloudflare-workers/cron-scheduler
 *   npx wrangler secret put CRON_SECRET
 *   npx wrangler deploy
 *
 * Test locally:
 *   npx wrangler dev
 *   curl "http://localhost:8787/__scheduled?cron=*%2F5+*+*+*+*"
 */

export default {
  /**
   * Scheduled handler - called on every cron trigger.
   */
  async scheduled(event, env, ctx) {
    await triggerScheduledJobs(env, event && event.cron ? String(event.cron) : 'scheduled');
  },

  /**
   * HTTP handler - allows manual trigger via GET request.
   * Also used by Cloudflare's local dev scheduled test endpoint.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'push-eagle-cron', time: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Manual trigger (protected by same CRON_SECRET)
    if (url.pathname === '/trigger' && request.method === 'POST') {
      const auth = request.headers.get('Authorization');
      if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      ctx.waitUntil(triggerScheduledJobs(env, 'manual'));

      return new Response(JSON.stringify({ ok: true, message: 'Cron triggered manually.' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

async function triggerScheduledJobs(env, cronLabel) {
  const appUrl = (env.APP_URL || 'https://push-eagle-dashboard.vercel.app').replace(/\/$/, '');
  const processCampaignsUrl = env.PROCESS_CAMPAIGNS_URL || `${appUrl}/api/cron/process-campaigns`;
  const processAutomationsUrl = env.PROCESS_AUTOMATIONS_URL || `${appUrl}/api/cron/process-automations`;
  const cronSecret = env.CRON_SECRET || '';

  if (!cronSecret) {
    console.error('[cron] CRON_SECRET is not set. Aborting.');
    return;
  }

  const headers = {
    Authorization: `Bearer ${cronSecret}`,
    'Content-Type': 'application/json',
    'x-worker-id': 'cf-cron-worker',
    'x-trigger-time': new Date().toISOString(),
  };

  console.log(`[cron] Firing at ${new Date().toISOString()} for cron: ${cronLabel}`);

  const results = await Promise.allSettled([
    callCronEndpoint(processCampaignsUrl, headers),
    callCronEndpoint(processAutomationsUrl, headers),
  ]);

  for (const [index, result] of results.entries()) {
    const label = index === 0 ? 'process-campaigns' : 'process-automations';
    if (result.status === 'fulfilled') {
      console.log(`[cron] ${label}:`, JSON.stringify(result.value));
    } else {
      console.error(`[cron] ${label} failed:`, result.reason);
    }
  }
}

/**
 * Call a cron endpoint and return the parsed JSON response.
 */
async function callCronEndpoint(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000); // 55s timeout

  try {
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
    }

    return body;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
