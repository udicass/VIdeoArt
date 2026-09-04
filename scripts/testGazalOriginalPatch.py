import cv2
import numpy as np
from pathlib import Path

input_path = Path("outputs/deforum-merged-previews/_gazal_original_frame.png")
output_path = Path("outputs/deforum-merged-previews/_gazal_original_patch_test.png")
image = cv2.imread(str(input_path))
if image is None:
    raise FileNotFoundError(input_path)

mask = np.zeros(image.shape[:2], dtype=np.uint8)
cv2.rectangle(mask, (570, 1125), (630, 1195), 255, -1)
repaired = cv2.inpaint(image, mask, 5, cv2.INPAINT_TELEA)
cv2.imwrite(str(output_path), repaired)
