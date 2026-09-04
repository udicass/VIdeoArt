import argparse
import base64
import json
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np

FORGE_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"

SOURCE = Path(r"D:\Users\User\Sonar\VIdeoArt\outputs\deforum-merged-previews\WOMANS\WOMANS.png")
OUTDIR = Path(r"D:\SD_Deforum_Fresh\outputs\img2img-images\WOMANS_MORPH_V1_30SEC")
W, H = 768, 432
FPS = 12
TOTAL_FRAMES = 360  # 30 seconds

BASE_IDENTITY = "the same woman from the input image, same face and identity, same framing"

SCENES = [
    "serene centered portrait, facing the viewer, soft cinematic light, high detail",
    "turning her head slightly to the side, gentle expression, soft studio light, high detail",
    "in a dreamlike garden, golden hour light, flowing hair, cinematic, high detail",
    "standing by a moonlit ocean, night sky, stars, cinematic, high detail",
]

NEGATIVE = (
    "text, watermark, signature, logo, extra limbs, extra head, missing limbs, "
    "malformed anatomy, deformed face, two people, multiple faces, duplicate, "
    "double exposure, ghosting, camera, lens, blurry, low quality"
)

DENOISE_START = 0.42
DENOISE_END = 0.32
STEPS = 24
SEED_BASE = 19082601


def cover_resize(img, target_w, target_h):
    """Center-crop to target aspect then resize, preserving content."""
    h, w = img.shape[:2]
    target_aspect = target_w / target_h
    aspect = w / h
    if aspect > target_aspect:
        new_w = int(h * target_aspect)
        x0 = (w - new_w) // 2
        img = img[:, x0:x0 + new_w]
    else:
        new_h = int(w / target_aspect)
        y0 = (h - new_h) // 2
        img = img[y0:y0 + new_h]
    return cv2.resize(img, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)


def encode_png(image):
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode frame")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def img2img(init_b64, prompt, denoise, steps, seed, retries=6):
    payload = {
        "init_images": [init_b64],
        "prompt": prompt,
        "negative_prompt": NEGATIVE,
        "denoising_strength": denoise,
        "steps": steps,
        "cfg_scale": 5.5,
        "width": W,
        "height": H,
        "sampler_name": "Euler a",
        "scheduler": "automatic",
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
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                result = json.loads(response.read().decode("utf-8"))
            image_b64 = result.get("images", [None])[0]
            if not image_b64:
                raise RuntimeError("Forge returned no image")
            image_b64 = image_b64.split(",", 1)[-1]
            data = np.frombuffer(base64.b64decode(image_b64), dtype=np.uint8)
            decoded = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if decoded is None:
                raise RuntimeError("Forge returned undecodable image")
            return decoded
        except Exception as e:  # noqa: BLE001 - transient Forge/CUDA blips
            last_error = e
            wait = 15 * attempt
            print(f"  img2img attempt {attempt}/{retries} failed: {e!r} -> retry in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"img2img failed after {retries} attempts: {last_error}")


def scene_for_frame(index):
    """Return (scene_prompt, t) for a frame index across the 4 scene segments."""
    segment_len = TOTAL_FRAMES // (len(SCENES) - 1)  # 90 frames per scene
    seg = min(index // segment_len, len(SCENES) - 2)
    t = (index - seg * segment_len) / segment_len
    return SCENES[seg], SCENES[seg + 1], t


def interpolate_prompt(a, b, t):
    if t < 0.5:
        return f"{BASE_IDENTITY}, {a}, {b}, transitioning toward scene, evolving smoothly, high detail"
    return f"{BASE_IDENTITY}, {a}, {b}, now in the new scene, settled, high detail"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0, help="frame to start at")
    parser.add_argument("--limit", type=int, default=TOTAL_FRAMES)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not SOURCE.exists():
        raise RuntimeError(f"Missing source: {SOURCE}")

    OUTDIR.mkdir(parents=True, exist_ok=True)

    source_img = cv2.imread(str(SOURCE))
    if source_img is None:
        raise RuntimeError(f"Could not read source: {SOURCE}")
    normalized = cover_resize(source_img, W, H)
    if not (OUTDIR / "source_0000.png").exists():
        cv2.imwrite(str(OUTDIR / "source_0000.png"), normalized)
        print("wrote source_0000.png (normalized 768x432)")

    previous = normalized
    made = 0
    for index in range(args.start, min(args.limit, TOTAL_FRAMES)):
        out_path = OUTDIR / f"morph_{index:04d}.png"
        if out_path.exists():
            previous = cv2.imread(str(out_path))
            if previous is None:
                raise RuntimeError(f"Existing frame unreadable: {out_path}")
            print(f"skip morph_{index:04d}.png")
            continue

        a, b, t = scene_for_frame(index)
        prompt = interpolate_prompt(a, b, t)
        denoise = DENOISE_START + (DENOISE_END - DENOISE_START) * (t if index % 90 < 45 else 1 - t)
        seed = (SEED_BASE + index) % (2**31)

        if args.dry_run:
            print(f"dry morph_{index:04d} t={t:.3f} denoise={denoise:.2f} prompt={prompt[:60]}...")
            continue

        fused = img2img(encode_png(previous), prompt, denoise, STEPS, seed)
        if not cv2.imwrite(str(out_path), fused):
            raise RuntimeError(f"Could not write {out_path}")
        previous = fused
        made += 1
        print(f"morph_{index:04d} scene={int(index // 90)} t={t:.2f} denoise={denoise:.2f}", flush=True)

    if made:
        time.sleep(1)
    done = len(list(OUTDIR.glob("morph_*.png")))
    print(f"DONE made={made} total_complete={done}/{TOTAL_FRAMES} outdir={OUTDIR}")


if __name__ == "__main__":
    main()
