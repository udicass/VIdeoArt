import cv2
import numpy as np
import random
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_getup_60sec_smooth_frames")
output = Path("outputs/deforum-merged-previews/CARA_getup_60sec_glitch_v145_frames")
output.mkdir(parents=True, exist_ok=True)

frames = sorted(source.glob("frame_*.png"))
total = len(frames)
fps = 24
duration = 60
keyframes = 14
transition_frame = [round(k * duration / keyframes * fps) for k in range(1, keyframes)]

def smooth(frame: np.ndarray) -> np.ndarray:
    median = cv2.medianBlur(frame, 3)
    return cv2.bilateralFilter(median, 5, 42, 42)

def glitch(frame: np.ndarray, rng: random.Random) -> np.ndarray:
    h, w = frame.shape[:2]
    out = frame.copy()
    # RGB channel shift (gentle)
    out = np.roll(out, rng.randint(-4, 4), axis=1)
    r, g, b = cv2.split(out)
    r = np.roll(r, rng.randint(-3, 3), axis=1)
    b = np.roll(b, rng.randint(-3, 3), axis=1)
    out = cv2.merge([r, g, b])
    # horizontal slice displacement (classic glitch)
    bands = rng.randint(2, 3)
    for _ in range(bands):
        y0 = rng.randint(0, h - 40)
        bh = rng.randint(20, 60)
        dx = rng.choice([-6, -4, -2, 2, 4, 6])
        out[y0:y0 + bh, :] = np.roll(out[y0:y0 + bh, :], dx, axis=1)
    return out

def strobe(frame: np.ndarray, phase: int, rng: random.Random) -> np.ndarray:
    mul = 1.05 if phase % 2 == 0 else 0.95
    f = frame.astype(np.float32) * mul
    return np.clip(f, 0, 255).astype(np.uint8)

for index in range(1, total + 1):
    image = cv2.imread(str(source / f"frame_{index:04d}.png"))
    burst = [f0 for f0 in transition_frame if f0 - 2 <= index - 1 <= f0 + 3]
    if burst:
        f0 = burst[0]
        rng = random.Random(f0 * 31 + (index - 1 - f0))
        image = smooth(image)
        image = glitch(image, rng)
        image = strobe(image, index - f0, rng)
    cv2.imwrite(str(output / f"frame_{index:04d}.png"), image)
    if index % 240 == 0:
        print("processed", index)

print("done", total)
