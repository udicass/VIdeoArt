import cv2
import numpy as np
from pathlib import Path

input_path = Path("outputs/deforum-merged-previews/_gazal_glow_source.png")
output_path = Path("outputs/deforum-merged-previews/_gazal_watermark_inpaint_test.png")
image = cv2.imread(str(input_path))
if image is None:
    raise FileNotFoundError(input_path)

mask = np.zeros(image.shape[:2], dtype=np.uint8)
cv2.rectangle(mask, (570, 1095), (665, 1190), 255, -1)
cv2.rectangle(mask, (675, 1080), (710, 1250), 255, -1)
mask = cv2.GaussianBlur(mask, (0, 0), 2)
repaired = cv2.inpaint(image, mask, 7, cv2.INPAINT_TELEA)
cv2.imwrite(str(output_path), repaired)
