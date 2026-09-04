import cv2
import numpy as np
from pathlib import Path

getup = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_GETUP_KEYFRAMES_V143_20SEC")
scenes = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_SCENES_V145")
out = Path("outputs/deforum-merged-previews/CARA_pause_frames")
out.mkdir(parents=True, exist_ok=True)

def smooth(image):
    median = cv2.medianBlur(image, 3)
    bilateral = cv2.bilateralFilter(median, 9, 60, 60)
    blur = cv2.GaussianBlur(bilateral, (0, 0), 1.0)
    return np.clip(cv2.addWeighted(bilateral, 1.4, blur, -0.4, 0), 0, 255).astype(np.uint8)

frames = []
for k in range(1, 25):
    directory = getup if k <= 14 else scenes
    path = directory / f"keyframe_{k:04d}.png"
    image = cv2.imread(str(path))
    if image is None:
        raise FileNotFoundError(path)
    scene = smooth(image)
    cv2.imwrite(str(out / f"scene_{k:02d}.png"), scene)
    frames.append(scene)

# Build a 4x6 contact sheet.
tile_h, tile_w = 256, 256
grid_rows, grid_cols = 6, 4
sheet = np.zeros((grid_rows * tile_h, grid_cols * tile_w, 3), dtype=np.uint8)
for idx, frame in enumerate(frames):
    resized = cv2.resize(frame, (tile_w, tile_h), interpolation=cv2.INTER_LANCZOS4)
    r, c = divmod(idx, grid_cols)
    sheet[r * tile_h:(r + 1) * tile_h, c * tile_w:(c + 1) * tile_w] = resized
cv2.imwrite(str(Path("outputs/deforum-merged-previews/CARA_pause_frames_contact.jpg")), sheet)
print("exported", len(frames), "pause frames")
