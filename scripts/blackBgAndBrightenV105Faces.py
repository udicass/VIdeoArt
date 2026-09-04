import cv2
import numpy as np
from pathlib import Path

src = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_FACES_V105')
dst = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_V107')
dst.mkdir(parents=True, exist_ok=True)

files = sorted(src.glob('single_figure_*.png'))
print(f'found {len(files)} source faces')

for f in files:
    img = cv2.imread(str(f))
    if img is None:
        raise RuntimeError(f'could not read {f}')
    h, w = img.shape[:2]

    # 1. Face brightness + blue tint (B up, G up slightly, R down)
    img2 = img.astype(np.float32)
    img2[:, :, 0] *= 1.50   # blue
    img2[:, :, 1] *= 1.10   # green
    img2[:, :, 2] *= 0.72   # red
    img2 = np.clip(img2, 0, 255).astype(np.uint8)

    # 2. Feathered elliptical mask keeping face/neck/shoulders, black elsewhere
    mask = np.zeros((h, w), dtype=np.float32)
    center = (w // 2, int(h * 0.50))
    axes = (int(w * 0.44), int(h * 0.52))
    cv2.ellipse(mask, center, axes, 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=w * 0.07)
    mask = np.clip(mask, 0, 1)[:, :, None]

    out = (img2.astype(np.float32) * mask).astype(np.uint8)
    cv2.imwrite(str(dst / f.name), out)
    print(f'black-bg {f.name}')

print(f'DONE -> {dst}')
