# Auto-push script to commit and push changes to both GitHub repos
# Usage: .\auto-push-both.ps1 "commit message"

param(
    [string]$message = "Auto-deploy: Update code changes"
)

# Function to push a repo
function Push-Repo {
    param([string]$repoPath, [string]$repoName)
    
    Set-Location $repoPath
    
    # Check if there are changes
    $status = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($status)) {
        Write-Host "✅ [$repoName] No changes to push" -ForegroundColor Green
        return
    }

    Write-Host "`n📝 [$repoName] Changes detected:" -ForegroundColor Cyan
    Write-Host $status -ForegroundColor Yellow

    # Add all changes
    Write-Host "📦 [$repoName] Staging changes..." -ForegroundColor Cyan
    git add -A

    # Commit
    Write-Host "💾 [$repoName] Committing..." -ForegroundColor Cyan
    git commit -m "$message"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ [$repoName] Commit failed" -ForegroundColor Red
        return
    }

    # Get current branch
    $branch = git rev-parse --abbrev-ref HEAD
    
    # Push
    Write-Host "🚀 [$repoName] Pushing to GitHub (branch: $branch)..." -ForegroundColor Cyan
    git push origin $branch

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ [$repoName] Successfully pushed to GitHub!" -ForegroundColor Green
    } else {
        Write-Host "❌ [$repoName] Push failed" -ForegroundColor Red
    }
}

# Push both repos
Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host "🔄 PUSHING CODE TO GITHUB" -ForegroundColor Magenta
Write-Host "=" * 60 -ForegroundColor Magenta

Push-Repo "d:\shopify app\push-eagle" "push-eagle (Shopify App)"
Push-Repo "d:\shopify app\push-eagle\shopify-webpush-app" "push-eagle-dashboard (Web App)"

Write-Host "`n" -ForegroundColor Magenta
Write-Host "=" * 60 -ForegroundColor Magenta
Write-Host "✅ DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Magenta
