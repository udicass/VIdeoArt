import cv2
import numpy as np
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_pause_frames")
out_path = Path("outputs/deforum-merged-previews/CARA_pause_frames_contact_labeled.jpg")

cols = 4
rows = 6
tile_w = 320
tile_h = 568
sheet = np.zeros((rows * tile_h, cols * tile_w, 3), dtype=np.uint8)

for idx in range(1, 25):
    image = cv2.imread(str(source / f"scene_{idx:02d}.png"))
    if image is None:
        continue
    resized = cv2.resize(image, (tile_w, tile_h), interpolation=cv2.INTER_LANCZOS4)
    r, c = divmod(idx - 1, cols)
    y0, x0 = r * tile_h, c * tile_w
    sheet[y0:y0 + tile_h, x0:x0 + tile_w] = resized
    label = f"{idx:02d}"
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 1.3, 3)
    cv2.rectangle(sheet, (x0, y0), (x0 + tw + 16, y0 + th + 18), (0, 0, 0), -1)
    cv2.putText(sheet, label, (x0 + 8, y0 + th + 10), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 255, 255), 3)

cv2.imwrite(str(out_path), sheet)
print(out_path, sheet.shape)
