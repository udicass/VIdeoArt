import argparse
from pathlib import Path

import cv2
import numpy as np


TARGET_CENTER = (256.0, 225.0)
TARGET_SIZE = 360.0
TARGET_EYE_CENTER = (256.0, 145.0)
TARGET_EYE_DISTANCE = 150.0
MANUAL_VOC_BOXES = {
    "single_figure_0004.png": (104, 0, 304, 304),
    "single_figure_0005.png": (104, 0, 304, 304),
}


def build_detectors():
    cascade_root = Path(cv2.data.haarcascades)
    return [
        cv2.CascadeClassifier(str(cascade_root / "haarcascade_frontalface_default.xml")),
        cv2.CascadeClassifier(str(cascade_root / "haarcascade_frontalface_alt2.xml")),
        cv2.CascadeClassifier(str(cascade_root / "haarcascade_profileface.xml")),
    ]


def build_eye_detector():
    cascade_root = Path(cv2.data.haarcascades)
    return cv2.CascadeClassifier(str(cascade_root / "haarcascade_eye.xml"))


def detect_eye_pair(image, detector):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    eyes = detector.detectMultiScale(
        gray,
        scaleFactor=1.05,
        minNeighbors=5,
        minSize=(24, 16),
        maxSize=(130, 100),
    )
    centers = sorted(
        ((x + width / 2.0, y + height / 2.0) for x, y, width, height in eyes),
        key=lambda point: point[0],
    )
    candidates = []
    for index, left in enumerate(centers):
        for right in centers[index + 1:]:
            horizontal_distance = right[0] - left[0]
            vertical_distance = abs(right[1] - left[1])
            if horizontal_distance > 45 and vertical_distance < 35:
                candidates.append((horizontal_distance, -vertical_distance, left, right))
    if not candidates:
        return None
    _, _, left, right = max(candidates, key=lambda candidate: candidate[:2])
    return left, right


def detect_face(image, detectors):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    candidates = []
    for detector in detectors:
        for scale_factor in (1.03, 1.05, 1.08, 1.1):
            faces = detector.detectMultiScale(
                gray,
                scaleFactor=scale_factor,
                minNeighbors=3,
                minSize=(90, 90),
            )
            candidates.extend(tuple(int(value) for value in face) for face in faces)
    if not candidates:
        return None
    return max(candidates, key=lambda face: face[2] * face[3])


def align_face(image, face):
    x, y, width, height = face
    face_size = float(max(width, height))
    scale = TARGET_SIZE / face_size
    source_center_x = x + width / 2.0
    source_center_y = y + height / 2.0
    transform = np.array(
        [
            [scale, 0.0, TARGET_CENTER[0] - scale * source_center_x],
            [0.0, scale, TARGET_CENTER[1] - scale * source_center_y],
        ],
        dtype=np.float32,
    )
    return cv2.warpAffine(
        image,
        transform,
        (512, 512),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REPLICATE,
    )


def align_eyes(image, eye_pair):
    left, right = eye_pair
    delta_x = right[0] - left[0]
    delta_y = right[1] - left[1]
    source_distance = float(np.hypot(delta_x, delta_y))
    source_angle = float(np.degrees(np.arctan2(delta_y, delta_x)))
    source_center = ((left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0)
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


def apply_blue_crt(image):
    softened = cv2.GaussianBlur(image, (0, 0), 0.65)
    blue, green, red = cv2.split(softened.astype(np.float32))
    blue = blue * 1.17 + 5.0
    green = green * 0.93 + 1.0
    red = red * 0.72
    tinted = cv2.merge((blue, green, red))
    tinted = np.clip((tinted - 128.0) * 1.08 + 116.0, 0, 255)

    scanline_gain = np.ones((512, 1, 1), dtype=np.float32)
    scanline_gain[1::2] = 0.82
    tinted *= scanline_gain

    yy, xx = np.mgrid[0:512, 0:512].astype(np.float32)
    radius = np.sqrt(((xx - 255.5) / 362.0) ** 2 + ((yy - 255.5) / 362.0) ** 2)
    vignette = np.clip(1.04 - 0.48 * radius**2, 0.52, 1.0)[..., None]
    tinted *= vignette
    return np.clip(tinted, 0, 255).astype(np.uint8)


def process_track(input_dir, output_dir, track, pattern, expected_count):
    detectors = build_detectors()
    eye_detector = build_eye_detector()
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = sorted(input_dir.glob(pattern))
    if len(frames) != expected_count:
        raise RuntimeError(
            f"Expected {expected_count} {track} frames matching {pattern}, found {len(frames)}"
        )

    for frame_path in frames:
        image = cv2.imread(str(frame_path))
        if image is None:
            raise RuntimeError(f"Could not read {frame_path}")
        face = detect_face(image, detectors)
        if face is None and track == "VOC":
            face = MANUAL_VOC_BOXES.get(frame_path.name)
        eye_pair = detect_eye_pair(image, eye_detector)
        if eye_pair is not None:
            aligned = align_eyes(image, eye_pair)
        elif face is not None:
            aligned = align_face(image, face)
        else:
            aligned = image.copy()
        processed = apply_blue_crt(aligned)
        output_path = output_dir / frame_path.name
        if not cv2.imwrite(str(output_path), processed):
            raise RuntimeError(f"Could not write {output_path}")
        print(f"{track} {frame_path.name}: face={face} eyes={eye_pair}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voc-input", type=Path, required=True)
    parser.add_argument("--deforum-input", type=Path, required=True)
    parser.add_argument("--voc-output", type=Path, required=True)
    parser.add_argument("--deforum-output", type=Path, required=True)
    parser.add_argument("--pattern", default="single_figure_*.png")
    parser.add_argument("--expected-count", type=int, default=12)
    args = parser.parse_args()
    process_track(
        args.voc_input, args.voc_output, "VOC", args.pattern, args.expected_count
    )
    process_track(
        args.deforum_input,
        args.deforum_output,
        "DEFORUM",
        args.pattern,
        args.expected_count,
    )


if __name__ == "__main__":
    main()