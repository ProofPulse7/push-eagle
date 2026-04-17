# END-TO-END TEST GUIDE

Complete walkthrough to activate and test the entire automation system from pixel event → campaign delivery.

---

## PREREQUISITES

- ✅ Shopify development store created
- ✅ Push-Eagle app installed on store
- ✅ Firebase project configured
- ✅ CRON_SECRET set in Vercel environment variables

---

## TEST FLOW

```
Web Pixel Fires Event
    ↓
Pixel Event Recorded (pixel_events table)
    ↓
Subscriber Activity Processed (subscriber_activity_events)
    ↓
Automation Rule Triggered (automation_jobs queued)
    ↓
Cron Job: Process Automations (every 5 min)
    ↓
Firebase FCM Send
    ↓
Notification Delivered to Browser
```

---

## PART 1: SETUP

### 1.1 Set CRON_SECRET

**Vercel Dashboard → Settings → Environment Variables**

```
Name: CRON_SECRET
Value: your-super-secret-key-12345
```

**Trigger Redeployment:**
```bash
git push origin main
# or click "Redeploy" in Vercel
```

### 1.2 Generate Test Data

**Create a test subscriber:**
```bash
curl -X POST "https://your-store.myshopify.com/api/2024-01/graphql.json" \
  -H "X-Shopify-Access-Token: YOUR_TOKEN" \
  -d '{"query": "query { shop { name } }"}'
```

Or wait for pixel event to auto-create subscriber.

### 1.3 Enable Automation Rules

Dashboard → Automations:
- ✅ Enable `browse_abandonment_15m`
- ✅ Enable `cart_abandonment_30m` (optional, for next test)

---

## PART 2: PIXEL EVENT TEST

### 2.1 Trigger Web Pixel Events

**Open storefront (incognito window):**
```
1. Navigate to product page
   → pixel fires: product_view event
   → recorded in pixel_events table

2. Add product to cart
   → pixel fires: add_to_cart event
   → recorded in pixel_events table

3. Proceed to checkout
   → pixel fires: checkout_start event
   → recorded in pixel_events table

4. (Optional) Complete purchase
   → webhook fires: orders/create
   → triggers post_purchase_followup automation
```

### 2.2 Verify Events in Database

**Check pixel events:**
```sql
SELECT * FROM pixel_events 
WHERE shop_domain = 'your-store.myshopify.com'
ORDER BY created_at DESC LIMIT 10;
```

**Expected output:**
```
id | shop_domain | external_id | event_type | created_at
---|-------------|-------------|-----------|-------------------
1  | ...         | px:...      | product_viewed | 2026-04-18 10:15:00
2  | ...         | px:...      | add_to_cart    | 2026-04-18 10:16:30
3  | ...         | px:...      | checkout_start | 2026-04-18 10:17:00
```

---

## PART 3: AUTOMATION QUEUEING TEST

### 3.1 Verify Activity Recorded

**Check subscriber activity:**
```sql
SELECT * FROM subscriber_activity_events 
WHERE shop_domain = 'your-store.myshopify.com'
AND external_id = 'px:your-store.myshopify.com:...'
ORDER BY created_at DESC LIMIT 10;
```

### 3.2 Verify Automation Jobs Queued

**Check automation jobs:**
```sql
SELECT 
  id, rule_key, status, due_at, created_at 
FROM automation_jobs 
WHERE shop_domain = 'your-store.myshopify.com'
ORDER BY created_at DESC LIMIT 10;
```

**Expected output (immediately after product view):**
```
id | rule_key | status | due_at | created_at
---|----------|--------|--------|-------------------
1  | browse_abandonment_15m | pending | 2026-04-18 10:30:00 | 2026-04-18 10:15:00
```

> **Note:** `due_at` is 15 minutes in the future (configured in automation rule)

---

## PART 4: CRON EXECUTION TEST

### 4.1 Wait or Trigger Manually

**Option A: Wait for cron to run**
- Cron runs every 5 minutes
- Next execution: within 5 minutes

**Option B: Manually trigger (local dev)**
```bash
cd shopify-webpush-app
npm run dev
```

**Test automation processor:**
```bash
curl -X GET "http://localhost:3000/api/cron/process-automations" \
  -H "Authorization: Bearer your-cron-secret"
```

**Expected response:**
```json
{
  "ok": true,
  "dueJobs": 0,
  "sentCount": 0,
  "failedCount": 0,
  "processed": []
}
```

> Note: `dueJobs: 0` because job isn't due yet (still 15 min away)

### 4.2 Test with Due Job

**Manually create a due automation job:**
```sql
INSERT INTO automation_jobs (
  id, shop_domain, rule_key, subscriber_id, token_id, 
  payload, status, due_at
)
SELECT 
  gen_random_uuid(),
  'your-store.myshopify.com',
  'browse_abandonment_15m',
  s.id,
  st.id,
  '{"title": "Test", "body": "Still interested?", "targetUrl": "/products/test"}'::jsonb,
  'pending',
  NOW() - INTERVAL '1 second'  -- Due now (in the past)
FROM subscribers s
JOIN subscriber_tokens st ON st.subscriber_id = s.id
WHERE s.shop_domain = 'your-store.myshopify.com'
LIMIT 1;
```

**Trigger automation processor again:**
```bash
curl -X GET "http://localhost:3000/api/cron/process-automations" \
  -H "Authorization: Bearer your-cron-secret"
```

**Expected response:**
```json
{
  "ok": true,
  "dueJobs": 1,
  "sentCount": 1,
  "failedCount": 0,
  "processed": [
    {
      "jobId": "abc123...",
      "processed": true,
      "error": null
    }
  ]
}
```

---

## PART 5: FIREBASE DELIVERY TEST

### 5.1 Check Notification in Browser

**Open storefront in DevTools:**
1. F12 → Application → Service Workers
2. Register service worker (done automatically)
3. Check notification appears in browser notification tray

**Or check Firebase console:**
```
Firebase Console → Messaging → Last message sent
```

### 5.2 Verify Job Status Updated

**Check automation job after cron execution:**
```sql
SELECT id, status, sent_at, error_message FROM automation_jobs 
WHERE shop_domain = 'your-store.myshopify.com'
ORDER BY updated_at DESC LIMIT 1;
```

**Expected:**
```
id | status | sent_at | error_message
---|--------|---------|---------------
1  | sent   | 2026-04-18 10:30:15 | NULL
```

---

## PART 6: SYSTEM MONITORING

### 6.1 Check System Health

```bash
curl https://your-app.vercel.app/api/health/system
```

**Expected response:**
```json
{
  "timestamp": "2026-04-18T10:35:00Z",
  "health": {
    "database": "healthy",
    "cron": "active"
  },
  "lastExecution": {
    "campaignsSent": "2026-04-18T10:30:00Z",
    "automationsSent": "2026-04-18T10:30:15Z",
    "minutesAgo": 5
  },
  "queues": {
    "dueCampaigns": 0,
    "dueAutomations": 0
  },
  "subscribers": {
    "total": 1,
    "withActiveTokens": 1
  },
  "stats": {
    "automationsSent": 1,
    "automationsPending": 0,
    "totalDeliveries": 1
  }
}
```

---

## PART 7: CAMPAIGN SCHEDULING TEST

### 7.1 Create Test Campaign

**Via API:**
```bash
curl -X POST "https://your-app.vercel.app/api/campaigns/send" \
  -H "X-Shop-Domain: your-store.myshopify.com" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test-campaign-1",
    "title": "Test Campaign",
    "body": "This is a test",
    "targetUrl": "https://your-store.myshopify.com",
    "smartDeliver": false
  }'
```

### 7.2 Schedule Campaign

```bash
curl -X POST "https://your-app.vercel.app/api/campaigns/schedule" \
  -H "X-Shop-Domain: your-store.myshopify.com" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test-campaign-1",
    "scheduleType": "immediate"
  }'
```

### 7.3 Verify Delivery Records

```sql
SELECT * FROM campaign_deliveries 
WHERE campaign_id = 'test-campaign-1'
LIMIT 10;
```

---

## PART 8: TROUBLESHOOTING

### Automation Job Not Processing

**Checklist:**
- [ ] Job `status = 'pending'` in database
- [ ] Job `due_at <= NOW()`
- [ ] `subscriber_tokens.status = 'active'`
- [ ] Firebase credentials are valid
- [ ] Cron secret is set in Vercel
- [ ] Check Vercel logs: `vercel logs --follow`

### Cron Not Running

**Checklist:**
- [ ] CRON_SECRET set in Vercel environment
- [ ] Vercel subscription is Standard or above (crons require paid plan)
- [ ] vercel.json has correct paths
- [ ] No function timeout errors

### Firebase Delivery Failed

**Checklist:**
- [ ] FCM token is fresh (< 30 days old)
- [ ] Firebase quotas not exceeded
- [ ] Token matches registered service worker
- [ ] Check Firebase error logs

---

## CHECKLIST

- [ ] CRON_SECRET set in Vercel
- [ ] Vercel redeployed
- [ ] Automation rules enabled
- [ ] Pixel event triggered on storefront
- [ ] Pixel event recorded in database
- [ ] Automation job queued
- [ ] Cron executed successfully
- [ ] Firebase FCM sent
- [ ] Notification delivered to browser
- [ ] Campaign scheduled and sent
- [ ] System health endpoint shows "healthy"

---

## NEXT STEPS

Once all tests pass:

1. **Monitor Real Traffic** - Watch production for pixel events/automations
2. **Build Dashboard** - Add UI for campaign creation/scheduling
3. **Set Alerts** - Monitor failed jobs and errors
4. **Performance Tune** - Adjust batch sizes for your scale
5. **A/B Testing** - Implement campaign variant testing
