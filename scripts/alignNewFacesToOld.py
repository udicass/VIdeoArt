import cv2
import numpy as np
from pathlib import Path

src = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_FACES_V105')
dst = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_ALIGNED_V109')
dst.mkdir(parents=True, exist_ok=True)

cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Target geometry from OLD V96 faces (avg face bbox)
TARGET_SIZE = 376
TARGET_CX = 255
TARGET_CY = 246

files = sorted(src.glob('single_figure_*.png'))
print(f'processing {len(files)} faces')

detected = []  # (scale, tx, ty) of detected faces for fallback

for f in files:
    img = cv2.imread(str(f))
    if img is None:
        raise RuntimeError(f'could not read {f}')
    h, w = img.shape[:2]

    # 1. brightness + blue tint
    img2 = img.astype(np.float32)
    img2[:, :, 0] *= 1.50
    img2[:, :, 1] *= 1.10
    img2[:, :, 2] *= 0.72
    img2 = np.clip(img2, 0, 255).astype(np.uint8)

    # 2. black background via feathered ellipse
    mask = np.zeros((h, w), dtype=np.float32)
    cv2.ellipse(mask, (w // 2, int(h * 0.50)), (int(w * 0.44), int(h * 0.52)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=w * 0.07)
    mask = np.clip(mask, 0, 1)[:, :, None]
    img2 = (img2.astype(np.float32) * mask).astype(np.uint8)

    # 3. detect face bbox
    gray = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) > 0:
        x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
        scale = TARGET_SIZE / float(fw)
        tx = TARGET_CX - scale * (x + fw / 2.0)
        ty = TARGET_CY - scale * (y + fh / 2.0)
        detected.append((scale, tx, ty))
        print(f'{f.name}: detected face, scale={scale:.3f} tx={tx:.0f} ty={ty:.0f}')
    else:
        print(f'{f.name}: NO FACE DETECTED (will use fallback transform)')

# compute fallback from detected faces
if detected:
    fs = float(np.mean([d[0] for d in detected]))
    ftx = float(np.mean([d[1] for d in detected]))
    fty = float(np.mean([d[2] for d in detected]))
else:
    fs, ftx, fty = 1.205, -40.2, -13.1
print(f'fallback transform: scale={fs:.3f} tx={ftx:.0f} ty={fty:.0f}')

# second pass: apply transforms (re-process from clean source for no-detection faces)
for f in files:
    img = cv2.imread(str(f))
    img2 = img.astype(np.float32)
    img2[:, :, 0] *= 1.50
    img2[:, :, 1] *= 1.10
    img2[:, :, 2] *= 0.72
    img2 = np.clip(img2, 0, 255).astype(np.uint8)
    mask = np.zeros((img.shape[0], img.shape[1]), dtype=np.float32)
    cv2.ellipse(mask, (img.shape[1] // 2, int(img.shape[0] * 0.50)), (int(img.shape[1] * 0.44), int(img.shape[0] * 0.52)), 0, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=img.shape[1] * 0.07)
    mask = np.clip(mask, 0, 1)[:, :, None]
    img2 = (img2.astype(np.float32) * mask).astype(np.uint8)

    gray = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) > 0:
        x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
        scale = TARGET_SIZE / float(fw)
        tx = TARGET_CX - scale * (x + fw / 2.0)
        ty = TARGET_CY - scale * (y + fh / 2.0)
    else:
        scale, tx, ty = fs, ftx, fty

    M = np.array([[scale, 0, tx], [0, scale, ty]], dtype=np.float64)
    out = cv2.warpAffine(img2, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0))
    cv2.imwrite(str(dst / f.name), out)

print(f'DONE -> {dst}')
