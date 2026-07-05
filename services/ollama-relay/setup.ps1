# setup.ps1 - One-time setup for the Ollama HTTPS relay
# Run this once. It generates a certificate for localhost and trusts it in
# Windows / Chrome so the live site can reach your local Ollama.
# After setup, run start.ps1 any time you want local AI on the live site.

param([int]$Port = 11435)

$dir = $PSScriptRoot
$pfxPath = Join-Path $dir "relay.pfx"
$pubCertPath = Join-Path $dir "relay.cer"
$pwdPath = Join-Path $dir ".cert-password"
$certPassword = "gesture3d-relay-2026"

Write-Host ""
Write-Host "  Gesture-3D - Ollama HTTPS Relay Setup" -ForegroundColor Cyan
Write-Host "  ======================================" -ForegroundColor Cyan
Write-Host ""

# -- 1. Generate self-signed certificate --------------------------------------
Write-Host "  [1/3] Generating certificate for localhost..."

# Remove old relay cert if present
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*Gesture3D*" } | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -like "*Gesture3D*" } | Remove-Item -Force -ErrorAction SilentlyContinue

$certArgs = @{
    Subject           = "CN=Gesture3D Local AI Relay"
    DnsName           = @("localhost", "127.0.0.1")
    CertStoreLocation = "Cert:\CurrentUser\My"
    NotAfter          = (Get-Date).AddYears(5)
    KeyAlgorithm      = "RSA"
    KeyLength         = 2048
    HashAlgorithm     = "SHA256"
    TextExtension     = @(
        "2.5.29.37={critical}{text}1.3.6.1.5.5.7.3.1"
    )
}

try {
    $cert = New-SelfSignedCertificate @certArgs
} catch {
    Write-Host "  ERROR: Could not generate certificate: $_" -ForegroundColor Red
    exit 1
}

# -- 2. Export certificate files -----------------------------------------------
Write-Host "  [2/3] Exporting certificate files..."

$securePwd = ConvertTo-SecureString -String $certPassword -Force -AsPlainText
try {
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePwd | Out-Null
    Export-Certificate -Cert $cert -FilePath $pubCertPath -Type CERT | Out-Null
    $certPassword | Set-Content -Path $pwdPath -NoNewline
} catch {
    Write-Host "  ERROR: Could not export certificate: $_" -ForegroundColor Red
    exit 1
}

# -- 3. Trust the certificate --------------------------------------------------
Write-Host "  [3/3] Trusting certificate in Windows / Chrome..."

try {
    Import-Certificate -FilePath $pubCertPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
} catch {
    Write-Host "  WARN: Could not auto-trust cert: $_" -ForegroundColor Yellow
    Write-Host "  You may need to run this script as Administrator, or manually" -ForegroundColor Yellow
    Write-Host "  import relay.cer into Chrome's trusted root certificates." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1.  Restart Chrome  (so it picks up the new trusted certificate)" -ForegroundColor Gray
Write-Host "    2.  Run:  .\start.ps1  to launch the relay" -ForegroundColor Gray
Write-Host "    3.  Open  https://gesture-3d.vercel.app  - local AI will work" -ForegroundColor Gray
Write-Host ""
Write-Host "  You only need to do this setup once." -ForegroundColor DarkGray
Write-Host ""
