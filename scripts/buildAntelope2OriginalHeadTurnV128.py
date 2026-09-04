import argparse
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--preview", action="store_true")
args = parser.parse_args()

root = Path.cwd()
preview_root = root / "outputs" / "deforum-merged-previews"
anchor_path = preview_root / "_antelop2_clean_anchor_512.png"
frames_dir = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-15\seated_ANTELOP2_ORIGINAL_HEAD_TURN_V128_30SEC")
frames_dir.mkdir(parents=True, exist_ok=True)

anchor = cv2.imread(str(anchor_path))
if anchor is None:
    raise FileNotFoundError(anchor_path)

mask = np.zeros((512, 512), np.uint8)
cv2.ellipse(mask, (330, 115), (145, 112), 0, 0, 360, 255, -1)
neck_polygon = np.array([[255, 120], [395, 120], [390, 245], [315, 245], [270, 205]], np.int32)
cv2.fillPoly(mask, [neck_polygon], 255)
mask = cv2.GaussianBlur(mask, (0, 0), 10).astype(np.float32) / 255.0

pivot_x, pivot_y = 325.0, 215.0

def render(progress: float) -> np.ndarray:
    eased = progress * progress * (3.0 - 2.0 * progress)
    angle = -3.0 * eased
    horizontal_scale = 1.0 - 0.14 * eased
    matrix = cv2.getRotationMatrix2D((pivot_x, pivot_y), angle, 1.0)
    matrix[0, 0] *= horizontal_scale
    matrix[0, 1] *= horizontal_scale
    matrix[0, 2] = pivot_x - matrix[0, 0] * pivot_x - matrix[0, 1] * pivot_y - 5.0 * eased
    matrix[1, 2] += 2.0 * eased
    moved = cv2.warpAffine(
        anchor,
        matrix,
        (512, 512),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT_101,
    )
    composed = anchor.astype(np.float32) * (1.0 - mask[:, :, None]) + moved.astype(np.float32) * mask[:, :, None]
    return np.clip(composed, 0, 255).astype(np.uint8)

if args.preview:
    preview_frames = [render(0.0), render(0.5), render(1.0)]
    comparison = np.hstack(preview_frames)
    cv2.imwrite(str(preview_root / "seated_ANTELOP2_ORIGINAL_HEAD_TURN_V128_preview.png"), comparison)
else:
    for frame_index in range(360):
        progress = frame_index / 359.0
        output = frames_dir / f"frame_{frame_index + 1:04d}.png"
        cv2.imwrite(str(output), render(progress))
    print(frames_dir)
