# push-beta.ps1 - git push then re-alias gesture-3d-beta.vercel.app

$Alias = 'gesture-3d-beta.vercel.app'
$PollSecs = 5
$MaxWaitSec = 180

# 1. Push
Write-Host "Pushing..." -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) {
    throw "git push failed (exit $LASTEXITCODE)"
}

# 2. Wait for a Ready deployment
Write-Host "Waiting for Vercel build..." -ForegroundColor Yellow
$deadline = (Get-Date).AddSeconds($MaxWaitSec)
$newUrl = $null

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds $PollSecs
    $lsOut = npx vercel ls 2>&1 | Out-String
    $m = [regex]::Match($lsOut, 'https://[\w-]+-[\w-]+\.vercel\.app')
    if ($m.Success) {
        $newUrl = $m.Value
        break
    }
    $secsLeft = [int]($deadline - (Get-Date)).TotalSeconds
    Write-Host "  building... ($secsLeft s left)" -ForegroundColor DarkGray
}

if (-not $newUrl) {
    throw "No deployment URL found within $MaxWaitSec seconds."
}

Write-Host "Latest: $newUrl" -ForegroundColor Green

# 3. Re-alias
Write-Host "Aliasing $Alias -> $newUrl" -ForegroundColor Cyan
npx vercel alias $newUrl $Alias 2>&1 | Write-Host

Write-Host "Done. https://$Alias is live." -ForegroundColor Green
