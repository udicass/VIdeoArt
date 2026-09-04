import cv2
import numpy as np
from pathlib import Path

input_path = Path("outputs/deforum-merged-previews/_gazal_original_frame.png")
output_path = Path("outputs/deforum-merged-previews/_gazal_no_glow_patch_test.png")
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

protected = np.zeros(image.shape[:2], dtype=np.uint8)
cv2.ellipse(protected, (485, 725), (125, 300), 0, 0, 360, 255, -1)
cv2.fillPoly(protected, [np.array([[365, 345], [520, 350], [570, 650], [410, 700], [365, 500]], np.int32)], 255)
cv2.ellipse(protected, (425, 355), (145, 95), 0, 0, 360, 255, -1)
cv2.line(protected, (60, 570), (430, 630), 255, 45)
cv2.line(protected, (65, 650), (425, 680), 255, 45)
cv2.line(protected, (50, 850), (420, 940), 255, 45)
cv2.line(protected, (55, 920), (410, 990), 255, 45)
cv2.line(protected, (430, 300), (690, 290), 255, 35)
protected = cv2.erode(protected, np.ones((25, 25), dtype=np.uint8))
protected = cv2.GaussianBlur(protected, (0, 0), 8).astype(np.float32) / 255.0

hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
hue = hsv[:, :, 0]
saturation = hsv[:, :, 1]
value = hsv[:, :, 2]
cyan = ((hue >= 70) & (hue <= 112) & (saturation >= 35) & (value >= 85)).astype(np.float32)
bright = ((saturation < 45) & (value >= 155)).astype(np.float32)
attenuation = np.maximum(cyan * 0.70, bright * 0.55) * (1.0 - protected)
hsv[:, :, 1] *= 1.0 - attenuation * 0.78
hsv[:, :, 2] *= 1.0 - attenuation * 0.62
image = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
cv2.imwrite(str(output_path), image)
