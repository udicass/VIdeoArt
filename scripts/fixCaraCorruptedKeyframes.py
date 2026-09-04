import cv2
import numpy as np
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_keyframes_bright")
output = Path("outputs/deforum-merged-previews/CARA_keyframes_bright_fixed")
output.mkdir(parents=True, exist_ok=True)

for k in range(1, 25):
    image = cv2.imread(str(source / f"keyframe_{k:04d}.png"))
    cv2.imwrite(str(output / f"keyframe_{k:04d}.png"), image)

anchor_before = cv2.imread(str(source / "keyframe_0008.png")).astype(np.float32)
anchor_after = cv2.imread(str(source / "keyframe_0014.png")).astype(np.float32)

# Replace corrupted keyframes 9-13 with safe pixel blends between the last-good (8) and next-good (14) frames.
broken = [9, 10, 11, 12, 13]
for position, k in enumerate(broken, start=1):
    t = position / (len(broken) + 1)
    blended = np.clip(anchor_before * (1 - t) + anchor_after * t, 0, 255).astype(np.uint8)
    cv2.imwrite(str(output / f"keyframe_{k:04d}.png"), blended)

print("replaced", broken)
