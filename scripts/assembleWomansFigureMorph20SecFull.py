"""Assemble 20s figure-morph movie: all 6 sharp figures, brief holds, 3s morphs each.

Layout: fig1 (1f) -> morph1 (18f) -> fig2 (1f) -> morph2 (18f) ... -> fig6 (hold to 20s).
Total 120 raw frames @ 6fps = exactly 20 seconds.
"""
from pathlib import Path

import cv2

FIGDIR = Path("outputs/deforum-merged-previews/WOMANS_MORPH_figures_sharp")
RAWDIR = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_MORPH_raw_v2")
OUT = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_MORPH_20SEC_frames")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 720, 1280
N_FIGURES = 6

def load(path):
    img = cv2.imread(str(path))
    if img is None:
        raise FileNotFoundError(path)
    if img.shape[1] != W or img.shape[0] != H:
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4)
    return img

figures = [load(FIGDIR / f"figure_{k}.png") for k in range(1, N_FIGURES + 1)]

idx = 0
total_raw = 120  # 20s at 6fps
accum = 0

def write(img):
    global idx, accum
    idx += 1
    accum += 1
    cv2.imwrite(str(OUT / f"frame_{idx:04d}.png"), img)

# Alternate: brief figure hold, then morph
for i in range(N_FIGURES - 1):
    write(figures[i])
    for j in range(1, 18):
        write(load(RAWDIR / f"morph_t{i + 1:02d}_s{j:02d}.png"))

# Final figure holds to fill exactly 120 frames
remaining = total_raw - accum
for _ in range(remaining):
    write(figures[N_FIGURES - 1])

print("raw frames:", idx, "= exactly", idx / 6.0, "s at 6fps")
