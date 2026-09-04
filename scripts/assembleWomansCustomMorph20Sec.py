"""Assemble 20s custom-scene morph movie: all 6 generated keyframes + 5 morphs.

Layout: keyframe1 (1f) -> morph1 (17f) -> keyframe2 (1f) ... -> keyframe6 (hold to 20s).
Total 120 raw frames @ 6fps = exactly 20 seconds.
"""
from pathlib import Path

import cv2

KEYDIR = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_KEYFRAMES_CUSTOM")
RAWDIR = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_MORPH_raw_custom")
OUT = Path("outputs/deforum-merged-previews/WOMANS_CUSTOM_MORPH_20SEC_frames")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 720, 1280
N_KEYFRAMES = 6

def load(path):
    img = cv2.imread(str(path))
    if img is None:
        raise FileNotFoundError(path)
    if img.shape[1] != W or img.shape[0] != H:
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4)
    return img

keyframes = [load(KEYDIR / f"keyframe_{k:02d}.png") for k in range(1, N_KEYFRAMES + 1)]

idx = 0
total_raw = 120

def write(img):
    global idx
    idx += 1
    cv2.imwrite(str(OUT / f"frame_{idx:04d}.png"), img)

# Alternate: brief keyframe hold, then morph (17 steps per transition)
for i in range(N_KEYFRAMES - 1):
    write(keyframes[i])
    for j in range(1, 18):
        write(load(RAWDIR / f"morph_t{i + 1:02d}_s{j:02d}.png"))

# Final keyframe holds to fill exactly 120 frames
remaining = total_raw - idx
for _ in range(remaining):
    write(keyframes[N_KEYFRAMES - 1])

print("raw frames:", idx, "= exactly", idx / 6.0, "s at 6fps")
