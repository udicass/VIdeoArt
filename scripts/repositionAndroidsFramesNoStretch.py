import argparse
from pathlib import Path

import cv2
import numpy as np

from alignAndroidsFacesCrt import build_eye_detector, detect_eye_pair


TARGET_EYE_CENTER = (256.0, 205.0)
# Uniform inter-eye distance so every face renders at the same scale.
TARGET_EYE_DISTANCE = 150.0


def reposition(image, eye_pair):
    left, right = eye_pair
    delta_x = right[0] - left[0]
    delta_y = right[1] - left[1]
    source_distance = float(np.hypot(delta_x, delta_y))
    source_angle = float(np.degrees(np.arctan2(delta_y, delta_x)))
    source_center = ((left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0)
    # Uniform scale + rotation + translation (similarity transform): normalizes
    # size and position without any aspect-ratio distortion (no stretching).
    scale = TARGET_EYE_DISTANCE / source_distance
    transform = cv2.getRotationMatrix2D(source_center, source_angle, scale)
    transform[0, 2] += TARGET_EYE_CENTER[0] - source_center[0]
    transform[1, 2] += TARGET_EYE_CENTER[1] - source_center[1]
    return cv2.warpAffine(
        image,
        transform,
        (512, 512),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REPLICATE,
    )


def process(input_dir, output_dir, label):
    detector = build_eye_detector()
    frames = sorted(input_dir.glob("single_figure_*.png"))
    if len(frames) != 12:
        raise RuntimeError(f"Expected 12 {label} frames, found {len(frames)}")
    output_dir.mkdir(parents=True, exist_ok=True)

    for frame_path in frames:
        image = cv2.imread(str(frame_path))
        if image is None:
            raise RuntimeError(f"Could not read {frame_path}")
        eye_pair = detect_eye_pair(image, detector)
        if eye_pair is None:
            raise RuntimeError(f"Could not detect both eyes in {frame_path}")
        fixed = reposition(image, eye_pair)
        output_path = output_dir / frame_path.name
        if not cv2.imwrite(str(output_path), fixed):
            raise RuntimeError(f"Could not write {output_path}")
        print(f"{label} {frame_path.name}: eyes={eye_pair}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voc-input", type=Path, required=True)
    parser.add_argument("--deforum-input", type=Path, required=True)
    parser.add_argument("--voc-output", type=Path, required=True)
    parser.add_argument("--deforum-output", type=Path, required=True)
    args = parser.parse_args()
    process(args.voc_input, args.voc_output, "VOC")
    process(args.deforum_input, args.deforum_output, "DEFORUM")


if __name__ == "__main__":
    main()