import { randomUUID } from 'crypto';

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';

export const runtime = 'nodejs';
export const maxDuration = 30;

type CheckResult = {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  detail?: string | null;
};

const check = async (
  name: string,
  fn: () => Promise<{ status: 'ok' | 'warn' | 'error'; message: string; detail?: string | null }>,
): Promise<CheckResult> => {
  try {
    const result = await fn();
    return { name, ...result };
  } catch (error) {
    return {
      name,
      status: 'error',
      message: 'Unexpected exception',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
};

// --- Env var checks ---
const checkEnvVar = (name: string, value: string, required = true): CheckResult => {
  const trimmed = value.trim();
  if (trimmed) {
    return { name, status: 'ok', message: 'Configured', detail: `${trimmed.slice(0, 8)}...` };
  }
  return {
    name,
    status: required ? 'error' : 'warn',
    message: required ? 'NOT configured — this is required' : 'Not configured (optional)',
    detail: null,
  };
};

const runEnvChecks = (): CheckResult[] => [
  checkEnvVar('DATABASE_URL / NEON_DATABASE_URL', env.NEON_DATABASE_URL || env.DATABASE_URL),
  checkEnvVar('R2_ACCOUNT_ID', env.R2_ACCOUNT_ID),
  checkEnvVar('R2_BUCKET_NAME', env.R2_BUCKET_NAME),
  checkEnvVar('R2_S3_ENDPOINT', env.R2_S3_ENDPOINT),
  checkEnvVar('R2_ACCESS_KEY_ID', env.R2_ACCESS_KEY_ID),
  checkEnvVar('R2_SECRET_ACCESS_KEY', env.R2_SECRET_ACCESS_KEY),
  checkEnvVar('R2_PUBLIC_BASE_URL', env.R2_PUBLIC_BASE_URL, false),
  checkEnvVar('FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64', env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64),
  checkEnvVar('NEXT_PUBLIC_FIREBASE_VAPID_KEY', env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
  checkEnvVar('VAPID_PUBLIC_KEY', env.VAPID_PUBLIC_KEY, false),
  checkEnvVar('VAPID_PRIVATE_KEY', env.VAPID_PRIVATE_KEY, false),
];

// --- R2 connectivity check ---
const runR2Checks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];

  // Check bucket name
  const bucketName = env.R2_BUCKET_NAME.trim();
  if (!bucketName) {
    results.push({ name: 'R2 Bucket Name', status: 'error', message: 'R2_BUCKET_NAME is not configured', detail: null });
    return results;
  }

  const endpoint = (env.R2_S3_ENDPOINT.trim() || (env.R2_ACCOUNT_ID.trim()
    ? `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
    : '')).replace(/\/$/, '');

  if (!endpoint) {
    results.push({ name: 'R2 Endpoint', status: 'error', message: 'R2_S3_ENDPOINT or R2_ACCOUNT_ID is not configured', detail: null });
    return results;
  }

  const accessKeyId = env.R2_ACCESS_KEY_ID.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY.trim();

  if (!accessKeyId || !secretAccessKey) {
    results.push({ name: 'R2 Credentials', status: 'error', message: 'R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY is not configured', detail: null });
    return results;
  }

  const client = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Upload test
  const testKey = `diagnostics/test-${randomUUID()}.txt`;
  const testContent = Buffer.from('push-eagle-diagnostic-test');

  results.push(await check('R2 Upload Test', async () => {
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    }));
    return { status: 'ok', message: `Uploaded test object: ${testKey}`, detail: `Bucket: ${bucketName}, Endpoint: ${endpoint}` };
  }));

  // Download test
  results.push(await check('R2 Download Test', async () => {
    const response = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: testKey }));
    const body = await response.Body?.transformToString();
    if (body !== 'push-eagle-diagnostic-test') {
      return { status: 'warn', message: 'Downloaded but content mismatch', detail: `Got: ${body}` };
    }
    return { status: 'ok', message: 'Downloaded and verified test object', detail: null };
  }));

  // Cleanup test file
  await check('R2 Cleanup Test', async () => {
    await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
    return { status: 'ok', message: 'Cleaned up test object', detail: null };
  });

  // Public URL test
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL.trim().replace(/\/$/, '');
  results.push(await check('R2 Public URL Config', async () => {
    if (!publicBaseUrl) {
      return { status: 'warn', message: 'R2_PUBLIC_BASE_URL not configured — app-served fallback URLs will be used', detail: null };
    }
    try {
      new URL(publicBaseUrl);
    } catch {
      return { status: 'error', message: 'R2_PUBLIC_BASE_URL is not a valid URL', detail: publicBaseUrl };
    }
    return { status: 'ok', message: `Custom domain configured: ${publicBaseUrl}`, detail: 'Images will use this domain in notifications' };
  }));

  return results;
};

// --- Database checks ---
const runDbChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];

  results.push(await check('Database Connection', async () => {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    await sql`SELECT 1 AS ok`;
    return { status: 'ok', message: 'Connected to Neon database', detail: null };
  }));

  results.push(await check('media_assets Table', async () => {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    const rows = await sql`
      SELECT COUNT(*)::int AS total, 
             COUNT(object_key)::int AS with_r2, 
             COUNT(public_url)::int AS with_public_url
      FROM media_assets
    `;
    const row = rows[0] as { total: number; with_r2: number; with_public_url: number } | undefined;
    if (!row) {
      return { status: 'warn', message: 'media_assets table empty or not found', detail: null };
    }
    return {
      status: 'ok',
      message: `${row.total} total assets, ${row.with_r2} stored in R2, ${row.with_public_url} with public URL`,
      detail: row.with_r2 === 0 ? 'No R2-backed assets yet — re-save images in reminder editors after R2 is configured' : null,
    };
  }));

  results.push(await check('automation_rules Table (Welcome Notifications)', async () => {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    const rows = await sql`
      SELECT shop_domain, enabled, config
      FROM automation_rules
      WHERE rule_key = 'welcome_subscriber'
      LIMIT 10
    `;
    if (rows.length === 0) {
      return { status: 'warn', message: 'No welcome_subscriber rules found — no shops configured yet', detail: null };
    }

    const details: string[] = [];
    for (const row of rows) {
      const config = (row.config ?? {}) as Record<string, unknown>;
      const steps = (config.steps ?? {}) as Record<string, Record<string, unknown>>;
      const stepKeys = Object.keys(steps);
      for (const stepKey of stepKeys) {
        const step = steps[stepKey] as Record<string, unknown>;
        const hasImage = step.imageUrl || step.windowsImageUrl || step.macosImageUrl || step.androidImageUrl;
        const hasButtons = Array.isArray(step.actionButtons) && (step.actionButtons as unknown[]).length > 0;
        details.push(
          `${String(row.shop_domain).slice(0, 20)} / ${stepKey}: enabled=${step.enabled}, image=${hasImage ? '✓' : '✗'}, buttons=${hasButtons ? (step.actionButtons as unknown[]).length : 0}`,
        );
      }
    }
    return {
      status: 'ok',
      message: `${rows.length} shop(s) with welcome_subscriber rules`,
      detail: details.join('\n'),
    };
  }));

  results.push(await check('Recent Automation Failures', async () => {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    const rows = await sql`
      SELECT id, shop_domain, rule_key, error_message, updated_at
      FROM automation_jobs
      WHERE status = 'failed'
      ORDER BY updated_at DESC
      LIMIT 10
    `;
    if (rows.length === 0) {
      return { status: 'ok', message: 'No failed automation jobs', detail: null };
    }
    const details = rows
      .map((r) => `[${String(r.rule_key)}] ${String(r.error_message ?? 'unknown error').slice(0, 120)}`)
      .join('\n');
    return { status: 'warn', message: `${rows.length} recent failed job(s)`, detail: details };
  }));

  results.push(await check('Recent Automation Deliveries', async () => {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    const rows = await sql`
      SELECT rule_key, COUNT(*)::int AS cnt
      FROM automation_deliveries
      WHERE delivered_at >= NOW() - INTERVAL '7 days'
      GROUP BY rule_key
      ORDER BY cnt DESC
    `;
    if (rows.length === 0) {
      return { status: 'warn', message: 'No automation deliveries in last 7 days', detail: null };
    }
    const detail = rows.map((r) => `${String(r.rule_key)}: ${Number(r.cnt)} sent`).join('\n');
    return { status: 'ok', message: `${rows.length} automation type(s) delivered in last 7 days`, detail };
  }));

  return results;
};

// --- Firebase Admin checks ---
const runFirebaseChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];

  results.push(await check('Firebase Admin SDK', async () => {
    if (!env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 && !env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON) {
      return { status: 'error', message: 'No Firebase service account credentials configured', detail: null };
    }
    const { getFirebaseAdminMessaging } = await import('@/lib/integrations/firebase/admin');
    const messaging = getFirebaseAdminMessaging();
    if (!messaging) {
      return { status: 'error', message: 'Firebase Admin Messaging returned null — check service account JSON', detail: null };
    }
    return { status: 'ok', message: 'Firebase Admin initialized successfully', detail: null };
  }));

  return results;
};

// --- Recent media uploads check ---
const runMediaChecks = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];

  results.push(await check('Recent Media Uploads (last 10)', async () => {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    const rows = await sql`
      SELECT id, shop_domain, content_type, object_key, public_url, created_at
      FROM media_assets
      ORDER BY created_at DESC
      LIMIT 10
    `;
    if (rows.length === 0) {
      return {
        status: 'warn',
        message: 'No media assets uploaded yet',
        detail: 'Upload an image in the reminder notification editor to test R2 storage',
      };
    }
    const detail = rows.map((r) => {
      const hasR2 = Boolean(r.object_key);
      const hasPub = Boolean(r.public_url);
      const url = r.public_url ? String(r.public_url).slice(0, 60) : r.object_key ? `r2:${String(r.object_key).slice(0, 40)}` : 'base64 only';
      return `[${hasR2 ? 'R2' : 'DB'}${hasPub ? '+URL' : ''}] ${url}`;
    }).join('\n');

    const r2Count = rows.filter((r) => r.object_key).length;
    const legacyCount = rows.length - r2Count;
    const status = legacyCount > 0 ? 'warn' : 'ok';
    const message = `${rows.length} assets: ${r2Count} in R2${legacyCount > 0 ? `, ${legacyCount} legacy (base64)` : ''}`;
    return { status, message, detail };
  }));

  return results;
};

export async function GET() {
  const startTime = Date.now();

  const [envResults, r2Results, dbResults, firebaseResults, mediaResults] = await Promise.all([
    Promise.resolve(runEnvChecks()),
    runR2Checks(),
    runDbChecks(),
    runFirebaseChecks(),
    runMediaChecks(),
  ]);

  const allResults = [
    { section: 'Environment Variables', checks: envResults },
    { section: 'Cloudflare R2 Storage', checks: r2Results },
    { section: 'Database (Neon)', checks: dbResults },
    { section: 'Firebase Admin', checks: firebaseResults },
    { section: 'Media Assets', checks: mediaResults },
  ];

  const totalErrors = allResults.flatMap((s) => s.checks).filter((c) => c.status === 'error').length;
  const totalWarns = allResults.flatMap((s) => s.checks).filter((c) => c.status === 'warn').length;

  return NextResponse.json({
    ok: totalErrors === 0,
    runAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    summary: { errors: totalErrors, warnings: totalWarns },
    sections: allResults,
  });
}
