import argparse
from pathlib import Path

import cv2
import numpy as np


def build_top_edge_mask(image: np.ndarray, threshold: int, top_scan: int) -> np.ndarray:
    h, w = image.shape[:2]
    scan_h = min(max(1, top_scan), h)

    # Candidate black pixels only near the top of the frame.
    roi = image[:scan_h, :, :]
    black = np.all(roi <= threshold, axis=2).astype(np.uint8) * 255

    # Keep only blobs connected to the top border so facial details are untouched.
    count, labels = cv2.connectedComponents(black)
    kept = np.zeros_like(black)
    for label in range(1, count):
        component = labels == label
        if np.any(component[0, :]):
            kept[component] = 255

    if not np.any(kept):
        return np.zeros((h, w), dtype=np.uint8)

    # Slightly expand mask to avoid dark seams after inpaint.
    kernel = np.ones((3, 3), np.uint8)
    kept = cv2.dilate(kept, kernel, iterations=1)

    full = np.zeros((h, w), dtype=np.uint8)
    full[:scan_h, :] = kept
    return full


def process_file(src: Path, dst: Path, threshold: int, top_scan: int, radius: int) -> None:
    image = cv2.imread(str(src), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Could not read image: {src}")

    mask = build_top_edge_mask(image, threshold=threshold, top_scan=top_scan)
    if np.any(mask):
        fixed = cv2.inpaint(image, mask, radius, cv2.INPAINT_TELEA)
    else:
        fixed = image

    dst.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(dst), fixed):
        raise RuntimeError(f"Could not write image: {dst}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pattern", type=str, default="morph_*.png")
    parser.add_argument("--threshold", type=int, default=10)
    parser.add_argument("--top-scan", type=int, default=180)
    parser.add_argument("--radius", type=int, default=3)
    args = parser.parse_args()

    frames = sorted(args.input.glob(args.pattern))
    if not frames:
        raise RuntimeError(f"No frames matched pattern '{args.pattern}' in {args.input}")

    args.output.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames, start=1):
        out_path = args.output / frame.name
        process_file(
            frame,
            out_path,
            threshold=max(0, min(40, args.threshold)),
            top_scan=max(1, args.top_scan),
            radius=max(1, args.radius),
        )
        print(f"fixed {index}/{len(frames)} {frame.name}")


if __name__ == "__main__":
    main()