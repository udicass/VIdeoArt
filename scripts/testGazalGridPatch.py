import cv2
import numpy as np
from pathlib import Path

input_path = Path("outputs/deforum-merged-previews/_gazal_original_frame.png")
output_path = Path("outputs/deforum-merged-previews/_gazal_original_grid_patch_test.png")
image = cv2.imread(str(input_path))
if image is None:
    raise FileNotFoundError(input_path)

x, y, width, height = 570, 1125, 60, 70
source_x = 486
patch = image[y : y + height, source_x : source_x + width].copy()
alpha = np.zeros((height, width), dtype=np.float32)
alpha[5:-5, 5:-5] = 1.0
alpha = cv2.GaussianBlur(alpha, (0, 0), 2)
region = image[y : y + height, x : x + width].astype(np.float32)
image[y : y + height, x : x + width] = (
    region * (1.0 - alpha[:, :, None]) + patch.astype(np.float32) * alpha[:, :, None]
).astype(np.uint8)
cv2.imwrite(str(output_path), image)
