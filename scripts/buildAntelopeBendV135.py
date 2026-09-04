import argparse
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--preview", action="store_true")
parser.add_argument("--frames", type=int, default=1080)
args = parser.parse_args()

root = Path.cwd()
preview_root = root / "outputs" / "deforum-merged-previews"
anchor_path = preview_root / "_antelop2_clean_anchor_512.png"
frames_dir = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-15\seated_ANTELOPE_BEND_V135_90SEC")
frames_dir.mkdir(parents=True, exist_ok=True)

anchor = cv2.imread(str(anchor_path))
if anchor is None:
    raise FileNotFoundError(anchor_path)

height, width = anchor.shape[:2]

def smoothstep(t: np.ndarray) -> np.ndarray:
    return np.clip(t, 0.0, 1.0) ** 2 * (3.0 - 2.0 * np.clip(t, 0.0, 1.0))

yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
row_weight = smoothstep((250.0 - yy) / (250.0 - 8.0)) ** 1.4
col_weight = smoothstep((xx - 195.0) / 40.0) * smoothstep((405.0 - xx) / 40.0)
region = row_weight * col_weight

pivot_x = 300.0
base_map_x, base_map_y = np.meshgrid(np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32))

def render(progress: float) -> np.ndarray:
    eased = progress * progress * (3.0 - 2.0 * progress)
    bend = -34.0 * eased * region
    compression = -(xx - pivot_x) * 0.07 * eased * region
    dip = 12.0 * eased * region
    map_x = (base_map_x - bend - compression).astype(np.float32)
    map_y = (base_map_y + dip).astype(np.float32)
    return cv2.remap(
        anchor,
        map_x,
        map_y,
        interpolation=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT_101,
    )

if args.preview:
    comparison = np.hstack([render(0.0), render(0.5), render(1.0)])
    cv2.imwrite(str(preview_root / "seated_ANTELOPE_BEND_V135_preview.png"), comparison)
else:
    for frame_index in range(args.frames):
        progress = frame_index / (args.frames - 1)
        output = frames_dir / f"frame_{frame_index + 1:04d}.png"
        cv2.imwrite(str(output), render(progress))
    print(frames_dir)
