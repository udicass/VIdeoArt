"""Assemble 20s custom-scene morph with original keyframe texture grain preserved.

Extract high-frequency grain from each keyframe and overlay on corresponding
morph frames to keep the original texture character.
"""
from pathlib import Path

import cv2
import numpy as np

KEYDIR = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_KEYFRAMES_CUSTOM")
RAWDIR = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_MORPH_raw_custom")
OUT = Path("outputs/deforum-merged-previews/WOMANS_CUSTOM_MORPH_20SEC_TEXTURED_frames")
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

def extract_grain(image):
    """Extract high-frequency grain (Laplacian-based texture)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    grain = cv2.Laplacian(blurred, cv2.CV_32F)
    grain = grain / (np.abs(grain).max() + 1e-6)
    return grain * 15

def blend_grain(morph_frame, grain, alpha=0.5):
    """Overlay grain onto morph frame."""
    morph_gray = cv2.cvtColor(morph_frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
    grained = morph_gray + grain * alpha
    grained = np.clip(grained, 0, 255).astype(np.uint8)
    grained_bgr = cv2.cvtColor(grained, cv2.COLOR_GRAY2BGR)
    return cv2.addWeighted(morph_frame, 0.7, grained_bgr, 0.3, 0)

keyframes = [load(KEYDIR / f"keyframe_{k:02d}.png") for k in range(1, N_KEYFRAMES + 1)]
grains = [extract_grain(kf) for kf in keyframes]

idx = 0
total_raw = 120

def write(img):
    global idx
    idx += 1
    cv2.imwrite(str(OUT / f"frame_{idx:04d}.png"), img)

for i in range(N_KEYFRAMES - 1):
    write(keyframes[i])
    grain_start = grains[i]
    grain_end = grains[i + 1]
    for j in range(1, 18):
        morph = load(RAWDIR / f"morph_t{i + 1:02d}_s{j:02d}.png")
        t = j / 18
        grain_blend = grain_start * (1 - t) + grain_end * t
        textured = blend_grain(morph, grain_blend, alpha=0.6)
        write(textured)

remaining = total_raw - idx
for _ in range(remaining):
    write(keyframes[N_KEYFRAMES - 1])

print("textured frames:", idx, "= exactly", idx / 6.0, "s at 6fps")
