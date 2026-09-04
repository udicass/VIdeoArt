import cv2
import numpy as np
from pathlib import Path

out = Path("outputs/deforum-merged-previews/CARA_getup_mask.png")
mask = np.zeros((1024, 576), dtype=np.uint8)
# Figure region that is allowed to animate (white); background stays locked (black).
cv2.ellipse(mask, (288, 624), (240, 376), 0, 0, 360, 255, -1)
mask = cv2.GaussianBlur(mask, (0, 0), 11)
cv2.imwrite(str(out), mask)
print(out, mask.shape, int(mask.max()))
