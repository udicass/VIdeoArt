import glob
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(r"D:\Users\User\Sonar\VIdeoArt")
PREVIEW = ROOT / "outputs" / "deforum-merged-previews"
FRAMES = Path(r"D:\SD_Deforum_Fresh\outputs\img2img-images\WOMANS_MORPH_V1_30SEC")

# Deforum-style frames here are named "morph_%04d.png" starting at 0000.
prefix = "morph"
frame_files = sorted(FRAMES.glob(f"{prefix}_*.png"))
count = len(frame_files)
if count == 0:
    print("NO FRAMES FOUND under", FRAMES, file=sys.stderr)
    sys.exit(1)

print(f"frames_dir={FRAMES} count={count}")

fps = 12
expected = 360
duration = expected / fps  # 30.0
video = PREVIEW / "WOMANS_MORPH_V1_30SEC_768x432_cuda.mp4"
contact = PREVIEW / "WOMANS_MORPH_V1_30SEC_contact.jpg"

PREVIEW.mkdir(parents=True, exist_ok=True)

# Encode the raw generated frames to a 30s 12fps mp4 (h264_nvenc when available).
subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error",
    "-framerate", str(fps),
    "-start_number", "0",
    "-i", str(FRAMES / f"{prefix}_%04d.png"),
    "-frames:v", str(expected),
    "-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "19", "-b:v", "0",
    "-vf", "format=yuv420p",
    "-an", str(video)
], check=True)

# Contact sheet: 5x4 grid of evenly spaced frames.
subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error",
    "-i", str(video),
    "-vf", f"select='not(mod(n,{expected // 20}))',scale=192:-1,tile=5x4",
    "-frames:v", "1", "-update", "1", str(contact)
], check=True)

# Validate with ffprobe.
probe = subprocess.run([
    "ffprobe", "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,nb_frames,duration",
    "-of", "json", str(video)
], capture_output=True, text=True, check=True)

print(probe.stdout)
print(f"video={video}")
print(f"contact={contact}")
