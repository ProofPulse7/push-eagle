const toInt = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const isAuthorized = (request, env) => {
  const secret = String(env.CRON_SECRET ?? '').trim();
  if (!secret) {
    return false;
  }

  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const xSecret = request.headers.get('x-automation-secret') ?? '';
  return bearer === secret || xSecret === secret;
};

const buildTickUrl = (env) => {
  const baseUrl = env.CRON_TICK_URL || `${env.APP_URL}/api/cron/tick`;
  const url = new URL(baseUrl);

  url.searchParams.set('campaignShards', String(toInt(env.CAMPAIGN_SHARDS, 4, 1, 64)));
  url.searchParams.set('automationShards', String(toInt(env.AUTOMATION_SHARDS, 6, 1, 64)));
  url.searchParams.set('ingestionShards', String(toInt(env.INGESTION_SHARDS, 4, 1, 64)));
  url.searchParams.set('maxCampaigns', String(toInt(env.MAX_CAMPAIGNS, 25, 1, 250)));
  url.searchParams.set('maxBatches', String(toInt(env.MAX_BATCHES, 20, 1, 2000)));
  url.searchParams.set('maxAutomationJobs', String(toInt(env.MAX_AUTOMATION_JOBS, 200, 1, 2000)));
  url.searchParams.set('maxAutomationConcurrent', String(toInt(env.MAX_AUTOMATION_CONCURRENT, 80, 1, 200)));
  url.searchParams.set('maxIngestionJobs', String(toInt(env.MAX_INGESTION_JOBS, 1000, 1, 5000)));
  url.searchParams.set('maxIngestionConcurrent', String(toInt(env.MAX_INGESTION_CONCURRENT, 100, 1, 200)));

  return url.toString();
};

const runCronTick = async (env) => {
  const url = buildTickUrl(env);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-automation-secret': env.CRON_SECRET,
      'x-vercel-cron': '1',
      'user-agent': 'vercel-cron/1.0',
      'x-worker-id': 'cf-cron-tick',
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = { raw: text.slice(0, 500) };
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
};

const enqueueAutomationJob = async (request, env) => {
  if (!isAuthorized(request, env)) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!env.AUTOMATION_QUEUE) {
    return new Response(JSON.stringify({ ok: false, error: 'Automation queue binding missing.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const body = await request.json();
  const jobId = String(body?.jobId ?? '').trim();
  const delaySeconds = toInt(body?.delaySeconds, 0, 0, 43200);

  if (!jobId) {
    return new Response(JSON.stringify({ ok: false, error: 'jobId is required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  await env.AUTOMATION_QUEUE.send({ jobId }, { delaySeconds });

  return new Response(JSON.stringify({ ok: true, jobId, delaySeconds }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const processAutomationQueueMessage = async (message, env) => {
  const jobId = String(message.body?.jobId ?? '').trim();
  if (!jobId) {
    message.ack();
    return;
  }

  const response = await fetch(`${env.APP_URL}/api/cron/process-automation-job`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-automation-secret': env.CRON_SECRET,
      'x-vercel-cron': '1',
      'content-type': 'application/json',
      'x-worker-id': 'cf-automation-queue',
    },
    body: JSON.stringify({ jobId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Automation job processing failed (${response.status}).`);
  }

  message.ack();
};

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCronTick(env));
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await processAutomationQueueMessage(message, env);
      } catch (error) {
        console.error('[automation-queue]', error);
        message.retry();
      }
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/internal/enqueue-automation' && request.method === 'POST') {
      return enqueueAutomationJob(request, env);
    }

    const result = await runCronTick(env);

    return new Response(JSON.stringify({
      ok: result.ok,
      mode: 'consolidated-tick',
      result,
    }), {
      status: result.ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    });
  },
};
