const toInt = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const buildShardUrl = (baseUrl, params) => {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const runCampaignShard = async (env, shardIndex, shardCount, maxCampaigns, maxBatches) => {
  const url = buildShardUrl(env.PROCESS_CAMPAIGNS_URL, {
    shardIndex,
    shardCount,
    maxCampaigns,
    maxBatches,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-automation-secret': env.CRON_SECRET,
      'x-worker-id': `cf-${shardIndex}`,
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
    jobType: 'campaigns',
    shardIndex,
    ok: response.ok,
    status: response.status,
    payload,
  };
};

const runAutomationShard = async (env, shardIndex, shardCount, maxJobs) => {
  const url = buildShardUrl(env.PROCESS_AUTOMATIONS_URL, {
    shardIndex,
    shardCount,
    maxJobs,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-automation-secret': env.CRON_SECRET,
      'x-worker-id': `cf-auto-${shardIndex}`,
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
    jobType: 'automations',
    shardIndex,
    ok: response.ok,
    status: response.status,
    payload,
  };
};

export default {
  async scheduled(_event, env, ctx) {
    const shardCount = toInt(env.SHARD_COUNT, 4, 1, 64);
    const maxCampaigns = toInt(env.MAX_CAMPAIGNS, 25, 1, 250);
    const maxBatches = toInt(env.MAX_BATCHES, 20, 1, 2000);
    const maxAutomationJobs = toInt(env.MAX_AUTOMATION_JOBS, 200, 1, 2000);

    const jobs = [];
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      jobs.push(runCampaignShard(env, shardIndex, shardCount, maxCampaigns, maxBatches));
      jobs.push(runAutomationShard(env, shardIndex, shardCount, maxAutomationJobs));
    }

    ctx.waitUntil(Promise.allSettled(jobs));
  },

  async fetch(_request, env) {
    const shardCount = toInt(env.SHARD_COUNT, 4, 1, 64);
    const maxCampaigns = toInt(env.MAX_CAMPAIGNS, 25, 1, 250);
    const maxBatches = toInt(env.MAX_BATCHES, 20, 1, 2000);
    const maxAutomationJobs = toInt(env.MAX_AUTOMATION_JOBS, 200, 1, 2000);

    const campaignRuns = Array.from({ length: shardCount }, (_, shardIndex) =>
      runCampaignShard(env, shardIndex, shardCount, maxCampaigns, maxBatches),
    );
    const automationRuns = Array.from({ length: shardCount }, (_, shardIndex) =>
      runAutomationShard(env, shardIndex, shardCount, maxAutomationJobs),
    );

    const results = await Promise.all([...campaignRuns, ...automationRuns]);

    return new Response(JSON.stringify({ ok: true, shardCount, results }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
};
