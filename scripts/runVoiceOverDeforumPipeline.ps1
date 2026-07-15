param(
  [Parameter(Mandatory = $true)]
  [string]$Storyboard,

  [Parameter(Mandatory = $true)]
  [string]$Audio,

  [string]$FramesDir = "outputs\voiceover-keyframes",
  [string]$Out = "outputs\voiceover-deforum.mp4",
  [string]$ForgeDir = "D:\SD_Deforum_Fresh",
  [string]$BaseUrl = "http://127.0.0.1:7860",
  [string]$Model = "",
  [switch]$NoMotion,
  [switch]$Overwrite
)

$ErrorActionPreference = 'Stop'

function Test-Endpoint {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Ensure-ForgeApi {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LaunchDir,

    [Parameter(Mandatory = $true)]
    [string]$ApiBaseUrl
  )

  $apiUrl = "$ApiBaseUrl/sdapi/v1/options"
  if (Test-Endpoint -Url $apiUrl) {
    Write-Host "Forge API ready at $ApiBaseUrl"
    return
  }

  if (Test-Endpoint -Url $ApiBaseUrl) {
    throw "Forge UI is running at $ApiBaseUrl but the REST API is disabled. Restart Forge from $LaunchDir after enabling --api in webui-user.bat."
  }

  $launcher = Join-Path $LaunchDir 'Launch_Deforum.bat'
  if (-not (Test-Path $launcher)) {
    throw "Launch_Deforum.bat not found in $LaunchDir"
  }

  Write-Host "Starting Forge from $launcher"
  Start-Process -FilePath $launcher | Out-Null

  for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
    if (Test-Endpoint -Url $apiUrl) {
      Write-Host "Forge API became ready at $ApiBaseUrl"
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "Forge API did not become ready at $ApiBaseUrl within the timeout window."
}

$workspaceRoot = Split-Path -Parent $PSScriptRoot
Push-Location $workspaceRoot
try {
  $storyboardPath = Resolve-Path $Storyboard
  $audioPath = Resolve-Path $Audio
  $framesPath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $FramesDir))
  $outPath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $Out))
  New-Item -ItemType Directory -Force -Path $framesPath | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outPath) | Out-Null

  Ensure-ForgeApi -LaunchDir $ForgeDir -ApiBaseUrl $BaseUrl

  $keyframeArgs = @(
    'run', 'voiceover:keyframes', '--',
    '--storyboard', $storyboardPath.Path,
    '--out-dir', $framesPath,
    '--provider', 'automatic1111',
    '--base-url', $BaseUrl
  )
  if ($Model) {
    $keyframeArgs += @('--model', $Model)
  }
  if ($Overwrite) {
    $keyframeArgs += '--overwrite'
  }

  Write-Host "Generating keyframes into $framesPath"
  & npm @keyframeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Keyframe generation failed."
  }

  $renderArgs = @(
    'run', 'voiceover:render', '--',
    '--storyboard', $storyboardPath.Path,
    '--frames-dir', $framesPath,
    '--audio', $audioPath.Path,
    '--out', $outPath
  )
  if ($NoMotion) {
    $renderArgs += @('--motion-mode', 'none')
  }

  Write-Host "Rendering video to $outPath"
  & npm @renderArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Video rendering failed."
  }

  Write-Host "Voice Over Deforum pipeline complete: $outPath"
} finally {
  Pop-Location
}