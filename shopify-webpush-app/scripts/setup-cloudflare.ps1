# One-time Cloudflare setup for Push Eagle (run locally after `npx wrangler login`)
# Account ID: d889f0c23f53a9054e3ddf29872defd7

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\cloudflare-cron

Write-Host "Creating Cloudflare Queues..."
npx wrangler queues create push-eagle-automation-jobs
npx wrangler queues create push-eagle-automation-jobs-dlq

Write-Host "Creating KV namespace..."
npx wrangler kv namespace create DASHBOARD_CACHE

Write-Host "Creating D1 database..."
npx wrangler d1 create push-eagle-events

Write-Host "Setting worker secret (use same value as Vercel CRON_SECRET)..."
npx wrangler secret put CRON_SECRET

Write-Host "Deploying worker..."
npx wrangler deploy

Write-Host ""
Write-Host "DONE. Copy these values into Vercel (push-eagle-dashboard project):"
Write-Host "  CLOUDFLARE_ACCOUNT_ID=d889f0c23f53a9054e3ddf29872defd7"
Write-Host "  CLOUDFLARE_KV_NAMESPACE_ID=<id from kv namespace create>"
Write-Host "  CLOUDFLARE_D1_DATABASE_ID=<uuid from d1 create>"
Write-Host "  CLOUDFLARE_WORKER_URL=<url printed by wrangler deploy>"
Write-Host "  AUTOMATION_QUEUE_ENABLED=true"
Write-Host "  D1_EVENTS_ENABLED=true"
Write-Host "  CLOUDFLARE_API_TOKEN=<create in Cloudflare dashboard - do NOT commit>"
