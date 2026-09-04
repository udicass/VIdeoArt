import cv2
import numpy as np
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_getup_60sec_glitch_v145_frames")
output = Path("outputs/deforum-merged-previews/CARA_getup_60sec_paused_smooth_frames")
output.mkdir(parents=True, exist_ok=True)

completions = [113, 216, 319, 421, 524, 627, 730, 833, 936, 1039, 1141, 1244]
pause_frames = 24

def smooth(frame: np.ndarray) -> np.ndarray:
    median = cv2.medianBlur(frame, 3)
    bilateral = cv2.bilateralFilter(median, 9, 60, 60)
    blur = cv2.GaussianBlur(bilateral, (0, 0), 1.0)
    sharp = cv2.addWeighted(bilateral, 1.4, blur, -0.4, 0)
    return np.clip(sharp, 0, 255).astype(np.uint8)

out_index = 0
for frame_number in range(1, 1441):
    frame = cv2.imread(str(source / f"frame_{frame_number:04d}.png"))
    if frame is None:
        raise FileNotFoundError(source / f"frame_{frame_number:04d}.png")
    hold = smooth(frame) if frame_number in completions else frame
    out_index += 1
    cv2.imwrite(str(output / f"frame_{out_index:04d}.png"), hold)
    if frame_number in completions:
        for _ in range(pause_frames):
            out_index += 1
            cv2.imwrite(str(output / f"frame_{out_index:04d}.png"), hold)

print("paused_smooth_total_frames", out_index, "=", round(out_index / 24, 2), "seconds")
