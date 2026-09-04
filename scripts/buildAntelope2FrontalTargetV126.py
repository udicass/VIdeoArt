import cv2
import numpy as np

anchor = cv2.imread(r"outputs\deforum-merged-previews\_antelop2_clean_anchor_512.png")
reference = cv2.imread(
    r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-15\antelope_V6_BLUEGRAY_TURN_CUDA_V113_20SEC\single_figure_0002.png"
)
segmentation = cv2.imread(r"outputs\deforum-merged-previews\_v113_frontal_head_mask.png", cv2.IMREAD_GRAYSCALE)

# Restore the background behind the original side head with repeated CRT texture,
# feathering the boundary so no rectangular panel remains.
texture = anchor.copy()
erase = np.zeros((512, 512), np.uint8)
polygon = np.array(
    [[188, 8], [511, 8], [511, 205], [430, 215], [365, 235], [305, 225], [235, 180], [188, 145]],
    np.int32,
)
cv2.fillPoly(erase, [polygon], 255)
for y_position in range(245):
    for x_position in range(185, 512):
        if erase[y_position, x_position]:
            source_x = 60 + ((x_position - 185) % 115)
            texture[y_position, x_position] = anchor[y_position, source_x]
feather = cv2.GaussianBlur(erase, (0, 0), 18).astype(np.float32) / 255.0
base = (
    anchor.astype(np.float32) * (1 - feather[:, :, None])
    + texture.astype(np.float32) * feather[:, :, None]
).astype(np.uint8)

# Restrict the segmented V113 animal to horns, head, and upper neck only.
manual = np.zeros((512, 512), np.uint8)
head_polygon = np.array(
    [[180, 8], [332, 8], [355, 150], [330, 245], [315, 330], [235, 330], [215, 250], [165, 160]],
    np.int32,
)
cv2.fillPoly(manual, [head_polygon], 255)
alpha_source = cv2.bitwise_and(segmentation, manual)
source_rgba = cv2.cvtColor(reference, cv2.COLOR_BGR2BGRA)
source_rgba[:, :, 3] = alpha_source

head = source_rgba[0:340, 155:360]
head = cv2.resize(head, (190, 315), interpolation=cv2.INTER_LANCZOS4)
alpha = head[:, :, 3].astype(np.float32) / 255.0
fade = np.ones(315, np.float32)
fade[250:] = np.linspace(1.0, 0.0, 65)
alpha *= fade[:, None]

gray = cv2.cvtColor(head[:, :, :3], cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
colored = np.zeros_like(head[:, :, :3], dtype=np.float32)
colored[:, :, 0] = 45 + gray * 180
colored[:, :, 1] = 55 + gray * 185
colored[:, :, 2] = 45 + gray * 150

x_position, y_position = 218, 0
region = base[y_position : y_position + 315, x_position : x_position + 190].astype(np.float32)
halo = cv2.GaussianBlur((alpha * 255).astype(np.uint8), (0, 0), 13).astype(np.float32) / 255.0
halo_color = np.array([205, 235, 125], np.float32)
region = region * (1 - 0.28 * halo[:, :, None]) + halo_color * (0.28 * halo[:, :, None])
region = region * (1 - alpha[:, :, None]) + colored * alpha[:, :, None]
base[y_position : y_position + 315, x_position : x_position + 190] = np.clip(region, 0, 255).astype(np.uint8)

cv2.imwrite(r"outputs\deforum-merged-previews\_antelop2_frontal_target_v126.png", base)
cv2.imwrite(r"outputs\deforum-merged-previews\_antelop2_frontal_target_v126_compare.png", np.hstack([anchor, base]))
