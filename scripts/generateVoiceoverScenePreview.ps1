param(
  [Parameter(Mandatory = $true)]
  [string]$StoryboardResultPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = (Get-Location).Path
$previewRoot = Join-Path $root 'outputs\deforum-merged-previews'
$work = Join-Path $previewRoot '_sd3_voiceover_scene_images_left_work'
$frameDir = Join-Path $work 'frames'
New-Item -ItemType Directory -Force -Path $frameDir | Out-Null
Remove-Item (Join-Path $frameDir '*.png') -Force -ErrorAction SilentlyContinue

$raw = Get-Content $StoryboardResultPath -Raw
$json = $raw -replace '^Result:\s*', ''
$data = $json | ConvertFrom-Json
$beats = @($data.beats | Select-Object -First 10)
if ($beats.Count -lt 1) { throw 'No voice-over beats found.' }

function New-Brush([int]$a, [int]$r, [int]$g, [int]$b) {
  [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb($a, $r, $g, $b))
}

function New-Pen([int]$a, [int]$r, [int]$g, [int]$b, [float]$w = 1) {
  [Drawing.Pen]::new([Drawing.Color]::FromArgb($a, $r, $g, $b), $w)
}

function Draw-Frame([int]$index, [string]$beat, [string]$outFile) {
  $width = 256
  $height = 512
  $rng = [Random]::new(7300 + $index)
  $bitmap = [Drawing.Bitmap]::new($width, $height)
  $g = [Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $bg = [Drawing.Drawing2D.LinearGradientBrush]::new(
    [Drawing.Rectangle]::new(0, 0, $width, $height),
    [Drawing.Color]::FromArgb(255, 8, 7, 9),
    [Drawing.Color]::FromArgb(255, 42, 14, 12),
    90
  )
  $g.FillRectangle($bg, 0, 0, $width, $height)
  $bg.Dispose()

  $redGlow = New-Brush 50 180 30 24
  $g.FillEllipse($redGlow, -40, 10, 330, 190)
  $redGlow.Dispose()

  $amberGlow = New-Brush 42 210 135 60
  $g.FillEllipse($amberGlow, 25, 120, 210, 180)
  $amberGlow.Dispose()

  if ($beat -match 'city|neon|window|rain|street|lamp') {
    $windowPen = New-Pen 130 38 190 160 2
    $dimPen = New-Pen 80 220 70 130 1
    $g.DrawRectangle($windowPen, 18, 24, 220, 150)
    for ($x = 55; $x -lt 220; $x += 45) { $g.DrawLine($dimPen, $x, 24, $x, 174) }
    for ($y = 65; $y -lt 165; $y += 46) { $g.DrawLine($dimPen, 18, $y, 238, $y) }
    for ($r = 0; $r -lt 16; $r++) {
      $rain = New-Pen (70 + $rng.Next(60)) 120 190 210 1
      $x = $rng.Next(20, 238)
      $g.DrawLine($rain, $x, 24, $x - 8, 174)
      $rain.Dispose()
    }
    $windowPen.Dispose(); $dimPen.Dispose()
  }

  $trayBrush = New-Brush 190 12 12 13
  $g.FillRectangle($trayBrush, 16, 336, 224, 96)
  $trayBrush.Dispose()
  $trayPen = New-Pen 170 165 150 135 2
  $g.DrawRectangle($trayPen, 16, 336, 224, 96)
  $trayPen.Dispose()

  for ($p = 0; $p -lt 4; $p++) {
    $paper = New-Brush (135 + $rng.Next(40)) (185 + $rng.Next(35)) (178 + $rng.Next(35)) (160 + $rng.Next(30))
    $x = 30 + $p * 48 + $rng.Next(-5, 8)
    $y = 350 + $rng.Next(-8, 20)
    $g.FillRectangle($paper, $x, $y, 40, 56)
    $paper.Dispose()
    $shadow = New-Pen 90 20 18 18 2
    $g.DrawRectangle($shadow, $x, $y, 40, 56)
    $shadow.Dispose()
  }

  if ($beat -match 'she|her|synthetic|creation|eyes|form|grace') {
    $body = New-Brush 150 42 40 45
    $skin = New-Brush 170 165 145 128
    $g.FillEllipse($skin, 104, 180, 48, 60)
    $g.FillRectangle($body, 92, 235, 72, 110)
    $g.FillEllipse($body, 84, 220, 88, 70)
    $skin.Dispose(); $body.Dispose()
    $rim = New-Pen 120 220 180 150 2
    $g.DrawEllipse($rim, 104, 180, 48, 60)
    $g.DrawLine($rim, 128, 240, 128, 330)
    $rim.Dispose()
  }

  if ($beat -match 'ghost|memory|sadness|yearning|ash|stardust|phantom') {
    for ($s = 0; $s -lt 11; $s++) {
      $mist = New-Brush (25 + $rng.Next(32)) 210 205 190
      $g.FillEllipse($mist, $rng.Next(-20, 220), $rng.Next(145, 380), $rng.Next(34, 120), $rng.Next(18, 76))
      $mist.Dispose()
    }
  }

  if ($beat -match 'chemical|emulsion|develop|print|halide|safe light|red') {
    for ($c = 0; $c -lt 22; $c++) {
      $dot = New-Brush (45 + $rng.Next(75)) 230 214 174
      $g.FillEllipse($dot, $rng.Next(18, 236), $rng.Next(322, 430), $rng.Next(1, 4), $rng.Next(1, 4))
      $dot.Dispose()
    }
  }

  $vignette = New-Pen 90 0 0 0 18
  $g.DrawRectangle($vignette, 2, 2, $width - 4, $height - 4)
  $vignette.Dispose()

  $g.Dispose()
  $bitmap.Save($outFile, [Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

for ($i = 0; $i -lt 40; $i++) {
  $beat = [string]$beats[$i % $beats.Count]
  Draw-Frame $i $beat (Join-Path $frameDir ('left_{0:D3}.png' -f $i))
}

$leftMp4 = Join-Path $previewRoot 'sd3_VOICEOVER_SCENE_IMAGES_LEFT.mp4'
$rightSrc = Join-Path $previewRoot 'sd3_voice_content_real_20x20_test.mp4'
$rightCopy = Join-Path $previewRoot 'sd3_Defourm_side_RIGHT.mp4'
$outMp4 = Join-Path $previewRoot 'sd3_VOICEOVER_SCENE_IMAGES_LEFT_vs_Defourm_side_RIGHT.mp4'
Copy-Item $rightSrc $rightCopy -Force

ffmpeg -y -loglevel error -framerate 15 -i (Join-Path $frameDir 'left_%03d.png') -vf 'scale=256:512,setsar=1' -frames:v 40 -c:v libx264 -pix_fmt yuv420p -movflags +faststart $leftMp4
ffmpeg -y -loglevel error -i $leftMp4 -i $rightCopy -filter_complex '[0:v]scale=256:512,setsar=1[left];[1:v]scale=256:512,setsar=1[right];[left][right]hstack=inputs=2' -frames:v 40 -c:v libx264 -pix_fmt yuv420p -movflags +faststart $outMp4
ffmpeg -y -loglevel error -i $outMp4 -frames:v 1 (Join-Path $previewRoot 'sd3_VOICEOVER_SCENE_IMAGES_LEFT_vs_Defourm_side_RIGHT_first.png')

$meta = ffprobe -v error -select_streams v:0 -show_entries stream=width,height,nb_frames,r_frame_rate -show_entries format=duration -of json $outMp4 | ConvertFrom-Json
[pscustomobject]@{
  file = Split-Path $outMp4 -Leaf
  width = $meta.streams[0].width
  height = $meta.streams[0].height
  frames = $meta.streams[0].nb_frames
  fps = $meta.streams[0].r_frame_rate
  duration = $meta.format.duration
  voiceBeatsUsed = $beats.Count
} | ConvertTo-Json