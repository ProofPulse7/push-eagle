#!/usr/bin/env node

/**
 * Deep debug script for welcome automation
 * Checks: jobs created, pending status, token existence, and send attempts
 */

import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('NEON_DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function debugWelcome() {
  console.log('=== WELCOME AUTOMATION DEBUG ===\n');
  
  const shopDomain = 'test-shop.myshopify.com';
  
  // 1. Check subscribers
  console.log('1. Subscribers:');
  const subscribers = await sql`
    SELECT id, external_id, created_at, last_seen_at
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log(`   Found ${subscribers.length} subscribers`);
  subscribers.forEach(s => {
    console.log(`   - ID ${s.id}: ${s.external_id} (created: ${s.created_at})`);
  });

  // 2. Check tokens
  console.log('\n2. Subscriber tokens:');
  const tokens = await sql`
    SELECT id, subscriber_id, fcm_token, status, token_type, created_at
    FROM subscriber_tokens
    WHERE shop_domain = ${shopDomain}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log(`   Found ${tokens.length} tokens`);
  tokens.forEach(t => {
    console.log(`   - Token ID ${t.id}: subscriber=${t.subscriber_id}, status=${t.status}, type=${t.token_type}, created=${t.created_at}`);
  });

  // 3. Check automation jobs
  console.log('\n3. Automation jobs (welcome_subscriber):');
  const jobs = await sql`
    SELECT id, rule_key, token_id, subscriber_id, status, due_at, payload, error_message, created_at
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    ORDER BY created_at DESC
    LIMIT 10
  `;
  console.log(`   Found ${jobs.length} welcome jobs`);
  jobs.forEach(j => {
    const payload = j.payload || {};
    console.log(`   - Job ID ${j.id.substring(0, 8)}...: 
       status=${j.status}, token=${j.token_id}, due=${j.due_at}
       step=${payload.metadata?.stepKey || 'none'}, 
       error=${j.error_message || 'none'}`);
  });

  // 4. Check automation deliveries
  console.log('\n4. Automation deliveries (sent welcome):');
  const deliveries = await sql`
    SELECT id, rule_key, subscriber_id, token_id, delivered_at, fcm_message_id
    FROM automation_deliveries
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    ORDER BY delivered_at DESC
    LIMIT 5
  `;
  console.log(`   Found ${deliveries.length} welcome deliveries`);
  deliveries.forEach(d => {
    console.log(`   - Delivery ID ${d.id}: token=${d.token_id}, fcm_msg=${d.fcm_message_id}, sent=${d.delivered_at}`);
  });

  // 5. Check automation rules
  console.log('\n5. Welcome automation rule config:');
  const rules = await sql`
    SELECT enabled, config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    LIMIT 1
  `;
  if (rules[0]) {
    const config = rules[0].config;
    console.log(`   Enabled: ${rules[0].enabled}`);
    if (config?.steps) {
      Object.entries(config.steps).forEach(([key, step]) => {
        console.log(`   - ${key}: enabled=${step.enabled}, delay=${step.delayMinutes}min`);
      });
    }
  }

  console.log('\n✓ Debug complete');
}

debugWelcome().catch(err => {
  console.error('Debug error:', err);
  process.exit(1);
});
