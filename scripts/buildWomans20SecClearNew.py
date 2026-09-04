import cv2
import numpy as np
from pathlib import Path

# 20-second CLEAR movie from 4 freshly generated figures.
# Each figure held 3 seconds with smooth, glitch-free crossfades.
KEYDIR = Path("outputs/deforum-merged-previews/WOMANS_clear_keyframes_v5")
out = Path("outputs/deforum-merged-previews/WOMANS_CRT_V2_CLEAR_20SEC_NEW_frames")
out.mkdir(parents=True, exist_ok=True)

FPS = 24
TOTAL = FPS * 20  # 480 frames
target_w, target_h = 720, 1280

gamma = 0.62
lut = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype(np.uint8)

figures = []
for k in range(1, 5):
    path = KEYDIR / f"keyframe_{k:04d}.png"
    image = cv2.imread(str(path))
    if image is None:
        raise FileNotFoundError(path)
    lifted = cv2.LUT(image, lut)
    lab = cv2.cvtColor(lifted, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    enhanced = cv2.cvtColor(cv2.merge([l_channel, a_channel, b_channel]), cv2.COLOR_LAB2BGR)
    figures.append(cv2.resize(enhanced, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4))

hold_frames = 72  # 3 seconds at 24fps
n_transitions = len(figures) - 1
remaining = TOTAL - len(figures) * hold_frames
base = remaining // n_transitions
extra = remaining - base * n_transitions
transition_lengths = [base + (1 if i < extra else 0) for i in range(n_transitions)]

out_index = 0
def write(image):
    global out_index
    out_index += 1
    cv2.imwrite(str(out / f"frame_{out_index:04d}.png"), image)

for i in range(len(figures)):
    for _ in range(hold_frames):
        write(figures[i])
    if i < n_transitions:
        a = figures[i].astype(np.float32)
        b = figures[i + 1].astype(np.float32)
        for f in range(transition_lengths[i]):
            t = f / max(transition_lengths[i] - 1, 1)
            ease = t * t * (3 - 2 * t)
            frame = np.clip(a * (1 - ease) + b * ease, 0, 255).astype(np.uint8)
            write(frame)

print("total_frames", out_index, "=", round(out_index / FPS, 2), "seconds")
print("transition_lengths", transition_lengths)
