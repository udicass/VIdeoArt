import cv2
import numpy as np
from pathlib import Path

src = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_FACES_V105')
dst = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_ALIGNED2_V111')
dst.mkdir(parents=True, exist_ok=True)

cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

TARGET_SIZE = 376.0
TARGET_CX = 255.0
TARGET_CY = 246.0
MIN_SCALE = 0.90
MAX_SCALE = 1.30

files = sorted(src.glob('single_figure_*.png'))

def process(img):
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
    return (img2.astype(np.float32) * mask).astype(np.uint8)

def detect_face(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=4, minSize=(60, 60))
    if len(faces) == 0:
        return None
    return max(faces, key=lambda r: r[2] * r[3])

# first pass: detect and collect transforms
transforms = {}
scales = []
for f in files:
    img = cv2.imread(str(f))
    proc = process(img)
    b = detect_face(proc)
    if b is None:
        transforms[f.name] = None
        print(f'{f.name}: NO FACE')
        continue
    x, y, w, h = b
    scale = TARGET_SIZE / float(w)
    if scale < MIN_SCALE or scale > MAX_SCALE:
        # re-detect with default params
        gray = cv2.cvtColor(proc, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
        if len(faces) > 0:
            x, y, w, h = max(faces, key=lambda r: r[2] * r[3])
            scale = TARGET_SIZE / float(w)
    scale = min(max(scale, MIN_SCALE), MAX_SCALE)
    tx = TARGET_CX - scale * (x + w / 2.0)
    ty = TARGET_CY - scale * (y + h / 2.0)
    transforms[f.name] = (scale, tx, ty)
    scales.append(scale)
    print(f'{f.name}: bbox {tuple(int(v) for v in (x,y,w,h))} scale={scale:.3f} tx={tx:.0f} ty={ty:.0f}')

# fallback for no-detection
median_scale = float(np.median(scales)) if scales else 1.0
print(f'median scale = {median_scale:.3f}')

for f in files:
    img = cv2.imread(str(f))
    proc = process(img)
    if transforms[f.name] is None:
        scale = median_scale
        # estimate center from face bbox on original (unmasked) or default center
        b = detect_face(proc)
        if b is None:
            # align using default center assumption
            tx = TARGET_CX - scale * 256.0
            ty = TARGET_CY - scale * 256.0
        else:
            x, y, w, h = b
            tx = TARGET_CX - scale * (x + w / 2.0)
            ty = TARGET_CY - scale * (y + h / 2.0)
        transforms[f.name] = (scale, tx, ty)
        print(f'{f.name}: fallback scale={scale:.3f}')
    scale, tx, ty = transforms[f.name]
    M = np.array([[scale, 0, tx], [0, scale, ty]], dtype=np.float64)
    out = cv2.warpAffine(proc, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    cv2.imwrite(str(dst / f.name), out)

print(f'DONE -> {dst}')
