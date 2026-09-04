import cv2
import numpy as np
import random
from pathlib import Path

getup = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_GETUP_KEYFRAMES_V143_20SEC")
scenes = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_SCENES_V145")
out = Path("outputs/deforum-merged-previews/CARA_120sec_frames")
out.mkdir(parents=True, exist_ok=True)

keyframes = []
for k in range(1, 25):
    directory = getup if k <= 14 else scenes
    path = directory / f"keyframe_{k:04d}.png"
    image = cv2.imread(str(path))
    if image is None:
        raise FileNotFoundError(path)
    keyframes.append(image)

height, width = keyframes[0].shape[:2]

def smooth(image):
    median = cv2.medianBlur(image, 3)
    bilateral = cv2.bilateralFilter(median, 9, 60, 60)
    blur = cv2.GaussianBlur(bilateral, (0, 0), 1.0)
    return np.clip(cv2.addWeighted(bilateral, 1.4, blur, -0.4, 0), 0, 255).astype(np.uint8)

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

segments = 23
morph_total = 2592
base = morph_total // segments
remainder = morph_total - base * segments
segment_lengths = [base + (1 if j < remainder else 0) for j in range(segments)]
assert sum(segment_lengths) == morph_total

completion_segments = set(range(0, 12))

out_index = 0
def write(image):
    global out_index
    out_index += 1
    cv2.imwrite(str(out / f"frame_{out_index:04d}.png"), image)

for j in range(segments):
    length = segment_lengths[j]
    a = keyframes[j].astype(np.float32)
    b = keyframes[j + 1].astype(np.float32)
    for f in range(length):
        t = f / max(length - 1, 1)
        ease = t * t * (3 - 2 * t)
        frame = np.clip(a * (1 - ease) + b * ease, 0, 255).astype(np.uint8)
        if f < 6:
            rng = random.Random(j * 1000 + f)
            frame = glitch(frame, rng)
            frame = strobe(frame, f)
        write(frame)
    if j in completion_segments:
        hold = smooth(keyframes[j + 1])
        for _ in range(24):
            write(hold)

print("total_frames", out_index, "=", round(out_index / 24, 2), "seconds")
