import cv2
import numpy as np

anchor = cv2.imread(r"outputs\deforum-merged-previews\_antelop2_clean_anchor_512.png")
rgba = cv2.imread(r"outputs\deforum-merged-previews\_v113_frontal_head_rgba.png", cv2.IMREAD_UNCHANGED)
base = anchor.copy()

erase = np.zeros((512, 512), np.uint8)
polygon = np.array(
    [[190, 8], [510, 8], [510, 222], [410, 222], [360, 245], [300, 230], [240, 190], [190, 150]],
    np.int32,
)
cv2.fillPoly(erase, [polygon], 255)
for y_position in range(512):
    x_positions = np.where(erase[y_position] > 0)[0]
    for x_position in x_positions:
        source_x = 90 + ((x_position - 190) % 95)
        base[y_position, x_position] = anchor[y_position, source_x]

head = rgba[0:330, 145:370]
head = cv2.resize(head, (205, 300), interpolation=cv2.INTER_LANCZOS4)
alpha = head[:, :, 3].astype(np.float32) / 255.0
fade = np.ones(300, np.float32)
fade[235:] = np.linspace(1.0, 0.0, 65)
alpha *= fade[:, None]

gray = cv2.cvtColor(head[:, :, :3], cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
colored = np.zeros_like(head[:, :, :3], dtype=np.float32)
colored[:, :, 0] = 58 + gray * 175
colored[:, :, 1] = 65 + gray * 180
colored[:, :, 2] = 54 + gray * 145

x_position, y_position = 210, 0
halo = cv2.GaussianBlur((alpha * 255).astype(np.uint8), (0, 0), 14).astype(np.float32) / 255.0
region = base[y_position : y_position + 300, x_position : x_position + 205].astype(np.float32)
halo_color = np.array([215, 235, 125], np.float32)
region = region * (1 - 0.30 * halo[:, :, None]) + halo_color * (0.30 * halo[:, :, None])
region = region * (1 - alpha[:, :, None]) + colored * alpha[:, :, None]
base[y_position : y_position + 300, x_position : x_position + 205] = np.clip(region, 0, 255).astype(np.uint8)

cv2.imwrite(r"outputs\deforum-merged-previews\_antelop2_frontal_target_v125.png", base)
cv2.imwrite(r"outputs\deforum-merged-previews\_antelop2_frontal_target_v125_compare.png", np.hstack([anchor, base]))
