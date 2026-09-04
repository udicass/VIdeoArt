import cv2
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_getup_60sec_glitch_v145_frames")
output = Path("outputs/deforum-merged-previews/CARA_getup_60sec_paused_frames")
output.mkdir(parents=True, exist_ok=True)

# Completion (settled pose) frame indices in the 60s/24fps timeline: keyframes 3,5,7,9,11,13 + settle offset.
completions = [216, 421, 627, 833, 1039, 1244]
pause_frames = 24

out_index = 0
for frame_number in range(1, 1441):
    frame = cv2.imread(str(source / f"frame_{frame_number:04d}.png"))
    if frame is None:
        raise FileNotFoundError(source / f"frame_{frame_number:04d}.png")
    out_index += 1
    cv2.imwrite(str(output / f"frame_{out_index:04d}.png"), frame)
    if frame_number in completions:
        for _ in range(pause_frames):
            out_index += 1
            cv2.imwrite(str(output / f"frame_{out_index:04d}.png"), frame)

print("paused_total_frames", out_index, "=", round(out_index / 24, 2), "seconds")
