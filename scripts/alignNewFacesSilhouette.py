import cv2
import numpy as np
from pathlib import Path

old_dir = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-09\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames')
src_dir = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_FACES_V105')
dst_dir = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_ALIGNED2_V111')
dst_dir.mkdir(parents=True, exist_ok=True)

def silhouette_bbox(img, thresh=25):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ys, xs = np.where(gray > thresh)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))  # x1,y1,x2,y2

# 1. target from old V96 faces
old_files = sorted(old_dir.glob('single_figure_*.png'))
old_boxes = []
for f in old_files:
    img = cv2.imread(str(f))
    b = silhouette_bbox(img)
    if b:
        old_boxes.append(b)
        print(f'old {f.name}: {b}')
old = np.array(old_boxes)
tx1, ty1, tx2, ty2 = [float(np.mean(old[:, i])) for i in range(4)]
t_cx = (tx1 + tx2) / 2.0
t_cy = (ty1 + ty2) / 2.0
t_h = ty2 - ty1
t_w = tx2 - tx1
print(f'\nOLD target silhouette: x1={tx1:.0f} y1={ty1:.0f} x2={tx2:.0f} y2={ty2:.0f} w={t_w:.0f} h={t_h:.0f} center=({t_cx:.0f},{t_cy:.0f})')

# 2. align new faces
src_files = sorted(src_dir.glob('single_figure_*.png'))
fallback_scale = 1.0
fallback_tx = 0.0
fallback_ty = 0.0
transforms = {}

for f in src_files:
    img = cv2.imread(str(f))
    if img is None:
        raise RuntimeError(f'could not read {f}')
    h, w = img.shape[:2]

    # black-bg + brighten + blue tint
    img2 = img.astype(np.float32)
    img2[:, :, 0] *= 1.50
    img2[:, :, 1] *= 1.10
    img2[:, :, 2] *= 0.72
    img2 = np.clip(img2, 0, 255).astype(np.uint8)
    mask = np.zeros((h, w), dtype=np.float32)
    cv2.ellipse(mask, (w // 2, int(h * 0.50)), (int(w * 0.44), int(h * 0.52)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=w * 0.07)
    mask = np.clip(mask, 0, 1)[:, :, None]
    img2 = (img2.astype(np.float32) * mask).astype(np.uint8)

    b = silhouette_bbox(img2)
    if b is None:
        print(f'{f.name}: no silhouette, using fallback')
        transforms[f.name] = (fallback_scale, fallback_tx, fallback_ty)
        continue
    x1, y1, x2, y2 = b
    cx = (x1 + x2) / 2.0
    cy = (y1 + y2) / 2.0
    bh = y2 - y1
    scale = t_h / float(bh)
    tx = t_cx - scale * cx
    ty = t_cy - scale * cy
    transforms[f.name] = (scale, tx, ty)
    print(f'{f.name}: silhouette {b} -> scale={scale:.3f} tx={tx:.0f} ty={ty:.0f}')

# 3. apply transforms
for f in src_files:
    img = cv2.imread(str(f))
    h, w = img.shape[:2]
    img2 = img.astype(np.float32)
    img2[:, :, 0] *= 1.50
    img2[:, :, 1] *= 1.10
    img2[:, :, 2] *= 0.72
    img2 = np.clip(img2, 0, 255).astype(np.uint8)
    mask = np.zeros((h, w), dtype=np.float32)
    cv2.ellipse(mask, (w // 2, int(h * 0.50)), (int(w * 0.44), int(h * 0.52)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=w * 0.07)
    mask = np.clip(mask, 0, 1)[:, :, None]
    img2 = (img2.astype(np.float32) * mask).astype(np.uint8)
    scale, tx, ty = transforms[f.name]
    M = np.array([[scale, 0, tx], [0, scale, ty]], dtype=np.float64)
    out = cv2.warpAffine(img2, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    cv2.imwrite(str(dst_dir / f.name), out)

print(f'\nDONE -> {dst_dir}')
