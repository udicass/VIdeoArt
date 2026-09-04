import argparse
from pathlib import Path

import cv2
import numpy as np

from alignAndroidsFacesCrt import (
    MANUAL_VOC_BOXES,
    apply_blue_crt,
    build_detectors,
    build_eye_detector,
    detect_eye_pair,
    detect_face,
)


TARGET_EYE_CENTER = (256.0, 205.0)
TARGET_EYE_DISTANCE = 150.0
TARGET_EYE_TO_CHIN = 236.0


def stabilize(image, eye_pair, face, align_mode):
    left, right = eye_pair
    delta_x = right[0] - left[0]
    delta_y = right[1] - left[1]
    source_distance = float(np.hypot(delta_x, delta_y))
    source_center = ((left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0)
    if align_mode == "eye":
        scale = TARGET_EYE_DISTANCE / source_distance
        angle = float(np.degrees(np.arctan2(delta_y, delta_x)))
        transform = cv2.getRotationMatrix2D(source_center, angle, scale)
        transform[0, 2] += TARGET_EYE_CENTER[0] - source_center[0]
        transform[1, 2] += TARGET_EYE_CENTER[1] - source_center[1]
    else:
        source_eye_to_chin = face[1] + face[3] - source_center[1]
        horizontal_scale = TARGET_EYE_DISTANCE / source_distance
        vertical_scale = TARGET_EYE_TO_CHIN / source_eye_to_chin
        linear = np.array(
            [
                [horizontal_scale, 0.0],
                [0.0, vertical_scale],
            ],
            dtype=np.float32,
        )
        source_center_vector = np.array(source_center, dtype=np.float32)
        target_center_vector = np.array(TARGET_EYE_CENTER, dtype=np.float32)
        translation = target_center_vector - linear @ source_center_vector
        transform = np.column_stack((linear, translation))
    return cv2.warpAffine(
        image,
        transform,
        (512, 512),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REPLICATE,
    )


def process(input_dir, output_dir, label, apply_crt, align_mode):
    face_detectors = build_detectors()
    detector = build_eye_detector()
    frames = sorted(input_dir.glob("single_figure_*.png"))
    if len(frames) != 12:
        raise RuntimeError(f"Expected 12 {label} V6 frames, found {len(frames)}")
    output_dir.mkdir(parents=True, exist_ok=True)

    for frame_path in frames:
        image = cv2.imread(str(frame_path))
        if image is None:
            raise RuntimeError(f"Could not read {frame_path}")
        eye_pair = detect_eye_pair(image, detector)
        if eye_pair is None:
            raise RuntimeError(f"Could not detect both eyes in {frame_path}")
        face = None
        if align_mode == "fullface":
            face = detect_face(image, face_detectors)
            if face is None and label == "VOC":
                face = MANUAL_VOC_BOXES.get(frame_path.name)
            if face is None:
                raise RuntimeError(f"Could not detect face bounds in {frame_path}")
        stabilized = stabilize(image, eye_pair, face, align_mode)
        if apply_crt:
            stabilized = apply_blue_crt(stabilized)
        output_path = output_dir / frame_path.name
        if not cv2.imwrite(str(output_path), stabilized):
            raise RuntimeError(f"Could not write {output_path}")
        print(f"{label} {frame_path.name}: eyes={eye_pair} face={face}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voc-input", type=Path, required=True)
    parser.add_argument("--deforum-input", type=Path, required=True)
    parser.add_argument("--voc-output", type=Path, required=True)
    parser.add_argument("--deforum-output", type=Path, required=True)
    parser.add_argument("--apply-crt", action="store_true")
    parser.add_argument(
        "--align-mode", choices=("eye", "fullface"), default="eye"
    )
    args = parser.parse_args()
    process(args.voc_input, args.voc_output, "VOC", args.apply_crt, args.align_mode)
    process(
        args.deforum_input, args.deforum_output, "DEFORUM", args.apply_crt, args.align_mode
    )


if __name__ == "__main__":
    main()