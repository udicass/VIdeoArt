import cv2
import numpy as np
from pathlib import Path

# Build a CLEAR version of WOMANS_CRT_V2_30SEC_3SPAUSE_720x1280_cuda.mp4:
# each figure is held crisply for 3 seconds, with smooth glitch-free crossfades.
src = Path("outputs/deforum-merged-previews/WOMANS_CRT_V2_30SEC_3SPAUSE_720x1280_cuda.mp4")
out = Path("outputs/deforum-merged-previews/WOMANS_CRT_V2_CLEAR_frames")
out.mkdir(parents=True, exist_ok=True)

# 0-based frame indices of each held figure (midpoint of the existing 3s pauses).
hold_indices = [36, 166, 295, 425, 555, 684]

cap = cv2.VideoCapture(str(src))
figures = []
for idx in hold_indices:
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError(f"failed to read frame {idx}")
    figures.append(frame)
cap.release()

height, width = figures[0].shape[:2]

def clear(image):
    # light denoise + gentle sharpen so each figure reads crisply
    median = cv2.medianBlur(image, 3)
    bilateral = cv2.bilateralFilter(median, 9, 60, 60)
    blur = cv2.GaussianBlur(bilateral, (0, 0), 1.0)
    return np.clip(cv2.addWeighted(bilateral, 1.4, blur, -0.4, 0), 0, 255).astype(np.uint8)

hold_frames = 72  # 3 seconds at 24fps
transition_lengths = [58, 57, 58, 58, 57]

out_index = 0
def write(image):
    global out_index
    out_index += 1
    cv2.imwrite(str(out / f"frame_{out_index:04d}.png"), image)

for i in range(6):
    figure = clear(figures[i])
    for _ in range(hold_frames):
        write(figure)
    if i < 5:
        length = transition_lengths[i]
        a = figure.astype(np.float32)
        b = clear(figures[i + 1]).astype(np.float32)
        for f in range(length):
            t = f / max(length - 1, 1)
            ease = t * t * (3 - 2 * t)
            frame = np.clip(a * (1 - ease) + b * ease, 0, 255).astype(np.uint8)
            write(frame)

print("total_frames", out_index, "=", round(out_index / 24, 2), "seconds")
