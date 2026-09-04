import cv2
import numpy as np
from pathlib import Path

root = Path.cwd()
preview_root = root / "outputs" / "deforum-merged-previews"
anchor = cv2.imread(str(preview_root / "_antelop2_clean_anchor_512.png"))
rgba = cv2.imread(str(preview_root / "_v113_frontal_head_rgba.png"), cv2.IMREAD_UNCHANGED)

# Head + upper neck only, excluding the torso.
head = rgba[0:270, 130:390]
head = cv2.resize(head, (200, 270), interpolation=cv2.INTER_LANCZOS4)
alpha = head[:, :, 3].astype(np.float32) / 255.0
fade = np.ones(270, np.float32)
fade[205:] = np.linspace(1.0, 0.0, 65)
alpha *= fade[:, None]

gray = cv2.cvtColor(head[:, :, :3], cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
colored = np.zeros_like(head[:, :, :3], dtype=np.float32)
colored[:, :, 0] = 45 + gray * 180
colored[:, :, 1] = 55 + gray * 185
colored[:, :, 2] = 45 + gray * 150

x0, y0 = 218, 0
region = anchor[y0 : y0 + 270, x0 : x0 + 200].astype(np.float32)
halo = cv2.GaussianBlur((alpha * 255).astype(np.uint8), (0, 0), 12).astype(np.float32) / 255.0
halo_color = np.array([205, 235, 125], np.float32)
region = region * (1 - 0.25 * halo[:, :, None]) + halo_color * (0.25 * halo[:, :, None])
region = region * (1 - alpha[:, :, None]) + colored * alpha[:, :, None]
anchor[y0 : y0 + 270, x0 : x0 + 200] = np.clip(region, 0, 255).astype(np.uint8)

guide = preview_root / "_antelop2_v113_frontal_guide_clean.png"
cv2.imwrite(str(guide), anchor)
cv2.imwrite(str(preview_root / "_antelop2_v113_frontal_guide_clean_compare.png"), np.hstack([cv2.imread(str(preview_root / "_antelop2_clean_anchor_512.png")), anchor]))
print(guide)
