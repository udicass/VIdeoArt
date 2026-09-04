import cv2
import numpy as np
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_keyframes_upscaled")

print(f"{'kf':>3} {'mean':>7} {'std':>7} {'meanHue':>8} {'satMean':>8} {'darkPct':>8} {'edgeDensity':>12}")
for k in range(1, 25):
    path = source / f"keyframe_{k:04d}.png"
    image = cv2.imread(str(path))
    if image is None:
        print(f"{k:3d}  MISSING")
        continue
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    mean_val = gray.mean()
    std_val = gray.std()
    hue_mean = hsv[:, :, 0].mean()
    sat_mean = hsv[:, :, 1].mean()
    dark_pct = float((gray < 25).mean() * 100)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float((edges > 0).mean() * 100)
    print(f"{k:3d} {mean_val:7.1f} {std_val:7.1f} {hue_mean:8.1f} {sat_mean:8.1f} {dark_pct:7.1f}% {edge_density:11.2f}%")
