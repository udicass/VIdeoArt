import cv2
import numpy as np
from pathlib import Path

source = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_GETUP_KEYFRAMES_V143_20SEC")
output = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_GETUP_KEYFRAMES_V144_SMOOTH")
output.mkdir(parents=True, exist_ok=True)

def smooth(image: np.ndarray) -> np.ndarray:
    # Remove fine CRT dot grid with a small median filter.
    median = cv2.medianBlur(image, 3)
    # Edge-preserving smoothing so faces stay recognizable.
    bilateral = cv2.bilateralFilter(median, 5, 42, 42)
    # Gentle unsharp mask to restore contours.
    blur = cv2.GaussianBlur(bilateral, (0, 0), 1.2)
    sharp = cv2.addWeighted(bilateral, 1.35, blur, -0.35, 0)
    return np.clip(sharp, 0, 255).astype(np.uint8)

files = sorted(source.glob("keyframe_*.png"))
for f in files:
    image = cv2.imread(str(f))
    cv2.imwrite(str(output / f.name), smooth(image))

first = cv2.imread(str(files[0]))
cv2.imwrite(
    str(Path("outputs/deforum-merged-previews/_cara_smooth_compare.png")),
    np.hstack([first, smooth(first)]),
)
print("smoothed", len(files), "keyframes")
