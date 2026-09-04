import cv2
import numpy as np
import random
from pathlib import Path

refined = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_KEYFRAMES_REFINED_720")
out = Path("outputs/deforum-merged-previews/CARA_120sec_refined_2spause_frames")
out.mkdir(parents=True, exist_ok=True)

target_w, target_h = 720, 1280
keyframes = []
for k in range(1, 25):
    path = refined / f"keyframe_{k:04d}.png"
    image = cv2.imread(str(path))
    if image is None:
        raise FileNotFoundError(path)
    keyframes.append(cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4))

height, width = keyframes[0].shape[:2]

def glitch(image, rng):
    result = image.copy()
    result = np.roll(result, rng.randint(-3, 3), axis=1)
    r, g, b = cv2.split(result)
    r = np.roll(r, rng.randint(-2, 2), axis=1)
    b = np.roll(b, rng.randint(-2, 2), axis=1)
    result = cv2.merge([r, g, b])
    for _ in range(rng.randint(2, 3)):
        y0 = rng.randint(0, height - 40)
        bh = rng.randint(20, 60)
        result[y0:y0 + bh, :] = np.roll(result[y0:y0 + bh, :], rng.choice([-5, -3, 3, 5]), axis=1)
    return result

def strobe(image, phase):
    multiplier = 1.05 if phase % 2 == 0 else 0.95
    return np.clip(image.astype(np.float32) * multiplier, 0, 255).astype(np.uint8)

hold_frames = 48
transition_lengths = [75] * 20 + [76] * 3

out_index = 0
def write(image):
    global out_index
    out_index += 1
    cv2.imwrite(str(out / f"frame_{out_index:04d}.png"), image)

for i in range(24):
    for _ in range(hold_frames):
        write(keyframes[i])
    if i < 23:
        length = transition_lengths[i]
        a = keyframes[i].astype(np.float32)
        b = keyframes[i + 1].astype(np.float32)
        for f in range(length):
            t = f / max(length - 1, 1)
            ease = t * t * (3 - 2 * t)
            frame = np.clip(a * (1 - ease) + b * ease, 0, 255).astype(np.uint8)
            if f < 6:
                rng = random.Random(i * 1000 + f)
                frame = glitch(frame, rng)
                frame = strobe(frame, f)
            write(frame)

print("total_frames", out_index, "=", round(out_index / 24, 2), "seconds")
