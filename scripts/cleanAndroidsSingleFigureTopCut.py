import argparse
import base64
import json
import urllib.request
from pathlib import Path

import cv2
import numpy as np


FORGE_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"

PROMPT = (
    "one solitary human woman, same recurring face identity, same eye position and scale, "
    "centered head-and-shoulders portrait, complete natural forehead and hairline, "
    "coherent anatomy, muted blue CRT portrait, clean dark background"
)

NEGATIVE = (
    "black bar, black border, top border, letterbox, frame edge, clipped head, cropped forehead, "
    "watermark, text, logo, duplicate face, second face, two people, extra eyes, melted face"
)


def to_b64(file_path: Path) -> str:
    raw = file_path.read_bytes()
    return base64.b64encode(raw).decode("ascii")


def save_image(base64_image: str, out_path: Path) -> None:
    clean_b64 = base64_image.split(",", 1)[-1]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(clean_b64))


def to_png_bytes(image: np.ndarray) -> bytes:
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode PNG")
    return buffer.tobytes()


def build_top_black_mask(image: np.ndarray, threshold: int = 14, top_scan: int = 180) -> np.ndarray:
    h, w = image.shape[:2]
    scan_h = min(max(1, top_scan), h)
    roi = image[:scan_h, :, :]
    black = np.all(roi <= threshold, axis=2).astype(np.uint8) * 255

    count, labels = cv2.connectedComponents(black)
    keep = np.zeros_like(black)
    for label in range(1, count):
        component = labels == label
        if np.any(component[0, :]):
            keep[component] = 255

    if not np.any(keep):
        return np.zeros((h, w), dtype=np.uint8)

    # Smooth mask edge slightly for cleaner blend.
    keep = cv2.dilate(keep, np.ones((3, 3), np.uint8), iterations=1)
    keep = cv2.GaussianBlur(keep, (5, 5), 0)

    full = np.zeros((h, w), dtype=np.uint8)
    full[:scan_h, :] = keep
    return full


def run_img2img(init_b64: str, mask_b64: str, seed: int, denoise: float, steps: int, cfg: float) -> str:
    payload = {
        "init_images": [init_b64],
        "mask": mask_b64,
        "mask_blur": 4,
        "inpainting_fill": 1,
        "inpaint_full_res": False,
        "inpainting_mask_invert": 0,
        "prompt": PROMPT,
        "negative_prompt": NEGATIVE,
        "denoising_strength": denoise,
        "steps": steps,
        "cfg_scale": cfg,
        "width": 512,
        "height": 512,
        "sampler_name": "DPM++ 2M",
        "scheduler": "Karras",
        "seed": seed,
        "batch_size": 1,
        "n_iter": 1,
        "restore_faces": False,
        "save_images": False,
    }

    request = urllib.request.Request(
        FORGE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json; charset=utf-8"},
    )

    with urllib.request.urlopen(request, timeout=300) as response:
        data = json.loads(response.read().decode("utf-8"))

    image_b64 = (data.get("images") or [None])[0]
    if not image_b64:
        raise RuntimeError("Forge returned no image")
    return image_b64


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pattern", default="single_figure_*.png")
    parser.add_argument("--seed", type=int, default=713168000)
    parser.add_argument("--denoise", type=float, default=0.55)
    parser.add_argument("--steps", type=int, default=24)
    parser.add_argument("--cfg", type=float, default=6.0)
    parser.add_argument("--mask-threshold", type=int, default=14)
    parser.add_argument("--top-scan", type=int, default=180)
    args = parser.parse_args()

    files = sorted(args.input.glob(args.pattern))
    if not files:
        raise RuntimeError(f"No frames matched pattern '{args.pattern}' in {args.input}")

    args.output.mkdir(parents=True, exist_ok=True)

    for index, src in enumerate(files, start=1):
        dst = args.output / src.name
        if dst.exists():
            print(f"skip {dst.name}")
            continue

        bgr = cv2.imread(str(src), cv2.IMREAD_COLOR)
        if bgr is None:
            raise RuntimeError(f"Could not read image: {src}")

        mask = build_top_black_mask(
            bgr,
            threshold=max(0, min(40, args.mask_threshold)),
            top_scan=max(1, args.top_scan),
        )
        if not np.any(mask):
            dst.write_bytes(src.read_bytes())
            print(f"copy {index}/{len(files)} {src.name} (no top black mask)")
            continue

        mask_b64 = base64.b64encode(to_png_bytes(mask)).decode("ascii")

        image_b64 = run_img2img(
            init_b64=to_b64(src),
            mask_b64=mask_b64,
            seed=args.seed + index,
            denoise=max(0.05, min(0.6, args.denoise)),
            steps=max(8, args.steps),
            cfg=max(2.0, min(12.0, args.cfg)),
        )
        save_image(image_b64, dst)
        print(f"cleaned {index}/{len(files)} {src.name}")

    print("DONE")


if __name__ == "__main__":
    main()