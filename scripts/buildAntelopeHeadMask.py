import cv2
import numpy as np
from pathlib import Path

out = Path(r"outputs\deforum-merged-previews\antelope_head_mask.png")
mask = np.zeros((512, 512), np.uint8)

# Head + horns region.
cv2.ellipse(mask, (300, 85), (105, 82), 0, 0, 360, 255, -1)
# Neck region tapering to the body.
neck = np.array([[242, 105], [362, 105], [355, 250], [312, 250], [286, 195]], np.int32)
cv2.fillPoly(mask, [neck], 255)

mask = cv2.GaussianBlur(mask, (0, 0), 3)
cv2.imwrite(str(out), mask)
print(out, mask.shape, int(mask.max()), int(np.count_nonzero(mask > 127)))
