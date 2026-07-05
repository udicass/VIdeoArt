# start.ps1 — Start the Ollama HTTPS relay
# Run this any time you want to use local AI from the live Vercel site.
# Keep this window open while using https://gesture-3d.vercel.app

param([int]$Port = 11435)

$dir = $PSScriptRoot

if (-not (Test-Path (Join-Path $dir "relay.pfx"))) {
    Write-Host ""
    Write-Host "  relay.pfx not found. Run setup.ps1 first:" -ForegroundColor Yellow
    Write-Host "    PowerShell -ExecutionPolicy Bypass -File `"$dir\setup.ps1`"" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Check if Ollama is running
try {
    $null = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  Ollama: running" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "  Ollama is not running. Starting it now..." -ForegroundColor Yellow
    Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Host "  Ollama: started" -ForegroundColor Green
}

Write-Host ""
$env:RELAY_PORT = $Port
node "$dir\server.js"
