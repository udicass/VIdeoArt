import cv2
import numpy as np
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_keyframes_upscaled")
output = Path("outputs/deforum-merged-previews/CARA_keyframes_bright")
output.mkdir(parents=True, exist_ok=True)

gamma = 0.62  # < 1 lifts shadows
lut = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype(np.uint8)

for k in range(1, 25):
    path = source / f"keyframe_{k:04d}.png"
    image = cv2.imread(str(path))
    if image is None:
        raise FileNotFoundError(path)
    lifted = cv2.LUT(image, lut)
    lab = cv2.cvtColor(lifted, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    enhanced = cv2.cvtColor(cv2.merge([l_channel, a_channel, b_channel]), cv2.COLOR_LAB2BGR)
    cv2.imwrite(str(output / f"keyframe_{k:04d}.png"), enhanced)

print("brightened 24 keyframes")
