# CRON JOB ACTIVATION GUIDE

## Overview
The cron infrastructure is **already built and deployed**. This guide enables automatic execution.

---

## STEP 1: Set Environment Variable

**Location:** Vercel Dashboard → Settings → Environment Variables

**Variable Name:** `CRON_SECRET`  
**Value:** Generate a secure secret (example: `super-secret-cron-key-12345`)

```bash
# Generate a random secret (run locally):
openssl rand -hex 32
# Output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Add to `.env.local` (local dev):**
```
CRON_SECRET=your-generated-secret-here
```

---

## STEP 2: Verify Cron Config

**File:** `shopify-webpush-app/vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/process-campaigns",
      "schedule": "*/5 * * * *"    // Every 5 minutes
    },
    {
      "path": "/api/cron/process-automations",
      "schedule": "*/5 * * * *"    // Every 5 minutes
    }
  ]
}
```

✅ **Status:** Already configured and deployed

---

## STEP 3: Test Cron Endpoints (Local)

### Start Dev Server
```bash
cd shopify-webpush-app
npm run dev
```

### Test Campaign Processor
```bash
curl -X GET "http://localhost:3000/api/cron/process-campaigns" \
  -H "Authorization: Bearer your-generated-secret-here"
```

**Expected Response:**
```json
{
  "ok": true,
  "workerId": "worker-0",
  "shardCount": 1,
  "shardIndex": 0,
  "dueCount": 0,
  "queuedCount": 0,
  "candidateCount": 0,
  "processedCount": 0,
  "failedCount": 0,
  "processed": []
}
```

### Test Automation Processor
```bash
curl -X GET "http://localhost:3000/api/cron/process-automations" \
  -H "Authorization: Bearer your-generated-secret-here"
```

**Expected Response:**
```json
{
  "ok": true,
  "shardCount": 1,
  "shardIndex": 0,
  "dueJobs": 0,
  "sentCount": 0,
  "failedCount": 0,
  "processed": []
}
```

---

## STEP 4: Deploy to Vercel

```bash
git add -A
git commit -m "chore: activate cron jobs"
git push origin main
# Vercel auto-deploys
```

Or manually in Vercel Dashboard:
1. Go to Settings → Environment Variables
2. Add `CRON_SECRET` with your secret value
3. Redeploy

---

## STEP 5: Monitor Cron Execution

### Vercel Dashboard
- **Path:** Deployments → [Your Deployment] → Functions → Cron

### Check Logs (Vercel CLI)
```bash
npm i -g vercel
vercel logs --follow --filter cron
```

### Verify in Database
```sql
-- Check if campaigns were sent
SELECT id, status, sent_at FROM campaigns 
WHERE shop_domain = 'your-store.myshopify.com'
ORDER BY sent_at DESC LIMIT 10;

-- Check automation job status
SELECT id, rule_key, status, sent_at FROM automation_jobs 
WHERE shop_domain = 'your-store.myshopify.com'
ORDER BY sent_at DESC LIMIT 20;
```

---

## STEP 6: Sharding for Scale (Optional)

For high-volume processing, deploy multiple workers with sharding:

### Worker 1 (Shard 0/2)
```bash
curl -X GET "https://your-app.vercel.app/api/cron/process-campaigns?shardCount=2&shardIndex=0" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Worker 2 (Shard 1/2)
```bash
curl -X GET "https://your-app.vercel.app/api/cron/process-campaigns?shardCount=2&shardIndex=1" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Use external scheduler (e.g., EasyCron, AWS Lambda, Cloudflare Workers) to trigger both workers.

---

## WHAT HAPPENS EVERY 5 MINUTES

### Process Campaigns (30-60s)
1. Query campaigns due for sending
   - `status='draft'` + `schedule_type='immediate'`
   - `status='scheduled'` + `send_at <= NOW`
   - `status='sent'` with recurring pattern

2. For each campaign:
   - Call `sendCampaignNotification()` → batch FCM sends
   - Update smart delivery metrics
   - Mark as sent

3. Return stats:
   - Campaigns processed
   - Delivery records created
   - Errors

### Process Automations (30-60s)
1. Prune old automation data (>60 days)
2. Query due automation jobs
   - `status='pending'` + `due_at <= NOW`

3. For each job:
   - Verify token is active
   - Check skip suppression rules
   - Send FCM message via Firebase Admin SDK
   - Mark as sent/failed

4. Return stats:
   - Jobs sent
   - Jobs failed
   - Remaining retries

---

## TROUBLESHOOTING

### Cron not triggering?
- ✅ Check CRON_SECRET is set in Vercel
- ✅ Check vercel.json has correct paths
- ✅ Check Vercel subscription (Standard or above)
- ✅ View Vercel logs: `vercel logs --follow`

### Cron timeout (>60s)?
- ✅ Reduce `maxCampaigns` or `maxJobs` query params
- ✅ Increase Vercel maxDuration in route.ts (max 300s for Pro)
- ✅ Use sharding to split load across workers

### Database query errors?
- ✅ Check NEON_DATABASE_URL is set
- ✅ Verify connection pool isn't exhausted
- ✅ Check database logs in Neon console

### FCM sending fails?
- ✅ Verify FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 is correct
- ✅ Check Firebase quota limits
- ✅ Ensure FCM tokens are fresh (< 30 days)

---

## MONITORING DASHBOARD (Coming Next)

We'll build a dashboard showing:
- ✏️ Real-time cron execution status
- ✏️ Campaign delivery progress
- ✏️ Automation job queue stats
- ✏️ Error tracking and alerts

---

## CHECKLIST

- [ ] Set `CRON_SECRET` in Vercel environment variables
- [ ] Test campaign processor locally
- [ ] Test automation processor locally
- [ ] Deploy to Vercel
- [ ] Monitor first cron execution in Vercel logs
- [ ] Verify campaigns are marked as `sent`
- [ ] Verify automation jobs are marked as `sent`
- [ ] Set up monitoring/alerts (optional)
- [ ] Test with real campaign send
