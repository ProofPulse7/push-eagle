#!/usr/bin/env node

/**
 * Test script to debug welcome automation flow
 * Tests: token registration -> immediate welcome dispatch
 */

const baseUrl = 'http://localhost:3001';
const testShop = 'test-shop.myshopify.com';

async function testWelcomeFlow() {
  console.log('=== WELCOME AUTOMATION TEST ===\n');

  // 1. Register a test token
  console.log('1. Registering subscriber token...');
  const registerResponse = await fetch(`${baseUrl}/api/storefront/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': `https://${testShop}`,
    },
    body: JSON.stringify({
      shopDomain: testShop,
      token: `test-token-${Date.now()}`,
      externalId: `test-user-${Date.now()}`,
      browser: 'chrome',
      platform: 'windows',
      locale: 'en-US',
    }),
  });

  if (!registerResponse.ok) {
    console.error('Registration failed:', registerResponse.status);
    console.error(await registerResponse.text());
    process.exit(1);
  }

  const registered = await registerResponse.json();
  console.log('✓ Subscriber registered:', registered);
  console.log(`  - subscriberId: ${registered.subscriberId}`);
  console.log(`  - tokenId: ${registered.tokenId}\n`);

  // 2. Check automation jobs created
  console.log('2. Checking automation jobs...');
  const jobsResponse = await fetch(`${baseUrl}/api/admin/automations/process-jobs?shop=${testShop}`);

  if (!jobsResponse.ok) {
    console.error('Failed to fetch jobs:', jobsResponse.status);
  } else {
    const jobs = await jobsResponse.json();
    console.log(`✓ Found ${jobs.length} automation jobs`);
    jobs.forEach((job, idx) => {
      console.log(`  [${idx}] Rule: ${job.rule_key}, Status: ${job.status}, DueAt: ${job.due_at}`);
    });
  }

  console.log('\n3. Checking automation rules...');
  const rulesResponse = await fetch(`${baseUrl}/api/automations/rules?shop=${testShop}`);
  const rules = await rulesResponse.json();
  const welcomeRule = rules.rules.find(r => r.ruleKey === 'welcome_subscriber');
  
  if (welcomeRule) {
    console.log('✓ Welcome automation enabled:', welcomeRule.enabled);
    console.log('  Reminders:');
    Object.entries(welcomeRule.config.steps).forEach(([key, step]) => {
      console.log(`    - ${key}: enabled=${step.enabled}, delay=${step.delayMinutes}min`);
    });
  }

  console.log('\n✓ Test complete');
}

testWelcomeFlow().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
