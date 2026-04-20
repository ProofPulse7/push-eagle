# Auto-push script to commit and push changes to GitHub
# Usage: .\auto-push.ps1 "commit message"

param(
    [string]$message = "Auto-deploy: Update code changes"
)

# Navigate to repo root
Set-Location "d:\shopify app\push-eagle"

# Check if there are changes
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "✅ No changes to push" -ForegroundColor Green
    exit 0
}

Write-Host "📝 Changes detected:" -ForegroundColor Cyan
Write-Host $status -ForegroundColor Yellow

# Add all changes
Write-Host "`n📦 Staging changes..." -ForegroundColor Cyan
git add -A

# Commit
Write-Host "💾 Committing..." -ForegroundColor Cyan
git commit -m "$message"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Commit failed" -ForegroundColor Red
    exit 1
}

# Push
Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
} else {
    Write-Host "❌ Push failed" -ForegroundColor Red
    exit 1
}
