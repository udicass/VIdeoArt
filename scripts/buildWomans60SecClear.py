import cv2
import numpy as np
from pathlib import Path

# 60-second CLEAR version: 6 figures looped twice, each held crisply for 3s,
# with smooth glitch-free crossfades (including figure 6 -> figure 1 loop point).
src = Path("outputs/deforum-merged-previews/WOMANS_CRT_V2_30SEC_3SPAUSE_720x1280_cuda.mp4")
out = Path("outputs/deforum-merged-previews/WOMANS_CRT_V2_CLEAR_60SEC_frames")
out.mkdir(parents=True, exist_ok=True)

FPS = 24
TOTAL = FPS * 60  # 1440 frames

# 0-based frame indices of each held figure in the source 30s movie.
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

def clear(image):
    median = cv2.medianBlur(image, 3)
    bilateral = cv2.bilateralFilter(median, 9, 60, 60)
    blur = cv2.GaussianBlur(bilateral, (0, 0), 1.0)
    return np.clip(cv2.addWeighted(bilateral, 1.4, blur, -0.4, 0), 0, 255).astype(np.uint8)

cleared = [clear(f) for f in figures]

# 12 figure slots: 1..6 then 1..6 again.
slots = cleared + cleared
hold_frames = 72  # 3 seconds at 24fps

n_transitions = len(slots) - 1
remaining = TOTAL - len(slots) * hold_frames
base = remaining // n_transitions
extra = remaining - base * n_transitions
transition_lengths = [base + (1 if i < extra else 0) for i in range(n_transitions)]

out_index = 0
def write(image):
    global out_index
    out_index += 1
    cv2.imwrite(str(out / f"frame_{out_index:04d}.png"), image)

for i in range(len(slots)):
    for _ in range(hold_frames):
        write(slots[i])
    if i < n_transitions:
        a = slots[i].astype(np.float32)
        b = slots[i + 1].astype(np.float32)
        for f in range(transition_lengths[i]):
            t = f / max(transition_lengths[i] - 1, 1)
            ease = t * t * (3 - 2 * t)
            frame = np.clip(a * (1 - ease) + b * ease, 0, 255).astype(np.uint8)
            write(frame)

print("total_frames", out_index, "=", round(out_index / FPS, 2), "seconds")
print("transition_lengths", transition_lengths)
