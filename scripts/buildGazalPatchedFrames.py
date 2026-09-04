import cv2
import numpy as np
from pathlib import Path

source = Path("outputs/deforum-merged-previews/Gazal.mp4")
output_dir = Path("outputs/deforum-merged-previews/Gazal_noglow_patched_source_frames")
output_dir.mkdir(parents=True, exist_ok=True)

capture = cv2.VideoCapture(str(source))
if not capture.isOpened():
    raise RuntimeError(f"Cannot read {source}")

frame_index = 1
x, y, width, height, source_x = 570, 1125, 60, 70, 486
alpha = np.zeros((height, width), dtype=np.float32)
alpha[5:-5, 5:-5] = 1.0
alpha = cv2.GaussianBlur(alpha, (0, 0), 2)

while True:
    ok, frame = capture.read()
    if not ok:
        break
    patch = frame[y : y + height, source_x : source_x + width].copy()
    region = frame[y : y + height, x : x + width].astype(np.float32)
    frame[y : y + height, x : x + width] = (
        region * (1.0 - alpha[:, :, None]) + patch.astype(np.float32) * alpha[:, :, None]
    ).astype(np.uint8)
    cv2.imwrite(str(output_dir / f"frame_{frame_index:04d}.png"), frame)
    frame_index += 1

capture.release()
print(frame_index - 1)
