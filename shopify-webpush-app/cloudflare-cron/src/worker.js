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
    maxConcurrent: toInt(env.MAX_AUTOMATION_CONCURRENT, 80, 1, 200),
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

const runIngestionShard = async (env, shardIndex, shardCount, limit) => {
  const url = buildShardUrl(env.PROCESS_INGESTION_URL, {
    shardIndex,
    shardCount,
    limit,
    maxConcurrent: toInt(env.MAX_INGESTION_CONCURRENT, 100, 1, 200),
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'x-automation-secret': env.CRON_SECRET,
      'x-worker-id': `cf-ingest-${shardIndex}`,
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
    jobType: 'ingestion',
    shardIndex,
    ok: response.ok,
    status: response.status,
    payload,
  };
};

export default {
  async scheduled(_event, env, ctx) {
    const campaignShards = toInt(env.CAMPAIGN_SHARDS, 4, 1, 64);
    const automationShards = toInt(env.AUTOMATION_SHARDS, 6, 1, 64);
    const ingestionShards = toInt(env.INGESTION_SHARDS, 4, 1, 64);
    const maxCampaigns = toInt(env.MAX_CAMPAIGNS, 25, 1, 250);
    const maxBatches = toInt(env.MAX_BATCHES, 20, 1, 2000);
    const maxAutomationJobs = toInt(env.MAX_AUTOMATION_JOBS, 200, 1, 2000);
    const maxIngestionJobs = toInt(env.MAX_INGESTION_JOBS, 1000, 1, 5000);

    const jobs = [];
    for (let shardIndex = 0; shardIndex < campaignShards; shardIndex += 1) {
      jobs.push(runCampaignShard(env, shardIndex, campaignShards, maxCampaigns, maxBatches));
    }

    for (let shardIndex = 0; shardIndex < automationShards; shardIndex += 1) {
      jobs.push(runAutomationShard(env, shardIndex, automationShards, maxAutomationJobs));
    }

    for (let shardIndex = 0; shardIndex < ingestionShards; shardIndex += 1) {
      jobs.push(runIngestionShard(env, shardIndex, ingestionShards, maxIngestionJobs));
    }

    ctx.waitUntil(Promise.allSettled(jobs));
  },

  async fetch(_request, env) {
    const campaignShards = toInt(env.CAMPAIGN_SHARDS, 4, 1, 64);
    const automationShards = toInt(env.AUTOMATION_SHARDS, 6, 1, 64);
    const ingestionShards = toInt(env.INGESTION_SHARDS, 4, 1, 64);
    const maxCampaigns = toInt(env.MAX_CAMPAIGNS, 25, 1, 250);
    const maxBatches = toInt(env.MAX_BATCHES, 20, 1, 2000);
    const maxAutomationJobs = toInt(env.MAX_AUTOMATION_JOBS, 200, 1, 2000);
    const maxIngestionJobs = toInt(env.MAX_INGESTION_JOBS, 1000, 1, 5000);

    const campaignRuns = Array.from({ length: campaignShards }, (_, shardIndex) =>
      runCampaignShard(env, shardIndex, campaignShards, maxCampaigns, maxBatches),
    );
    const automationRuns = Array.from({ length: automationShards }, (_, shardIndex) =>
      runAutomationShard(env, shardIndex, automationShards, maxAutomationJobs),
    );
    const ingestionRuns = Array.from({ length: ingestionShards }, (_, shardIndex) =>
      runIngestionShard(env, shardIndex, ingestionShards, maxIngestionJobs),
    );

    const results = await Promise.all([...campaignRuns, ...automationRuns, ...ingestionRuns]);

    return new Response(JSON.stringify({
      ok: true,
      shards: {
        campaigns: campaignShards,
        automations: automationShards,
        ingestion: ingestionShards,
      },
      results,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
};
