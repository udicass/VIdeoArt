import cv2
import numpy as np
from pathlib import Path

old_dir = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-09\androids_dream_VOC_V6_CONTENT_STABILIZED_V16_NO_DEVIATION_frames')
new_dir = Path(r'D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-14\androids_dream_VOC_V6_MALE_TO_FEMALE_BLACKBG_V107')

cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def face_bbox(path):
    img = cv2.imread(str(path))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) == 0:
        return None
    # largest face
    x, y, w, h = max(faces, key=lambda r: r[2] * r[3])
    return (x, y, w, h, img.shape[1], img.shape[0])

old_files = sorted(old_dir.glob('single_figure_*.png'))
new_files = sorted(new_dir.glob('single_figure_*.png'))

print('OLD (V96 source) faces:')
old_boxes = []
for f in old_files:
    b = face_bbox(f)
    old_boxes.append(b)
    print(f'  {f.name}: {b}')
print('NEW (V107 source) faces:')
new_boxes = []
for f in new_files:
    b = face_bbox(f)
    new_boxes.append(b)
    print(f'  {f.name}: {b}')

old_ok = [b for b in old_boxes if b]
new_ok = [b for b in new_boxes if b]
if old_ok and new_ok:
    def avg(boxes, idx):
        return np.mean([b[idx] for b in boxes])
    print('\nOLD avg: x={:.0f} y={:.0f} w={:.0f} h={:.0f}'.format(*[avg(old_ok, i) for i in range(4)]))
    print('NEW avg: x={:.0f} y={:.0f} w={:.0f} h={:.0f}'.format(*[avg(new_ok, i) for i in range(4)]))
