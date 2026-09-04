"""Assemble the 10s figure-morph test: raw 6fps sequence at 720x1280.

Layout: fig1 -> fig2 -> fig3 -> fig4 (3s morph each, 18 raw frames per
transition) + 1s hold on fig4 = 60 raw frames = 10s. Interpolate to 24fps
with ffmpeg afterwards.
"""
from pathlib import Path

import cv2

FIGDIR = Path("outputs/deforum-merged-previews/WOMANS_MORPH_figures_sharp")
RAWDIR = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_MORPH_raw_v2")
OUT = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_MORPH_10SEC_V3_frames")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 720, 1280
STEPS = 18
N_FIGURES = 4

def load(path):
    img = cv2.imread(str(path))
    if img is None:
        raise FileNotFoundError(path)
    if img.shape[1] != W or img.shape[0] != H:
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4)
    return img

figures = [load(FIGDIR / f"figure_{k}.png") for k in range(1, N_FIGURES + 1)]

idx = 0
def write(img):
    global idx
    idx += 1
    cv2.imwrite(str(OUT / f"frame_{idx:04d}.png"), img)

for i in range(N_FIGURES - 1):
    write(figures[i])
    for j in range(1, STEPS):
        write(load(RAWDIR / f"morph_t{i + 1:02d}_s{j:02d}.png"))
# final figure + hold to 60 raw frames (1s at 6fps)
for _ in range(6):
    write(figures[N_FIGURES - 1])

print("raw frames:", idx, "=", idx / 6.0, "s at 6fps")
