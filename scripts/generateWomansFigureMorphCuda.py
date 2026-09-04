"""CUDA figure-morph frames for the WOMANS CLEAR figures.

Blends consecutive figures (extracted from the 60s CLEAR movie) and fuses each
blend through Forge img2img on cuda:0 so the morph reads as one coherent figure
instead of a double exposure. Resumable: existing morph PNGs are skipped.

Raw output is 6 fps; interpolate to 24 fps at assembly time.
"""
import argparse
import base64
import json
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np

FORGE_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"
FIGDIR = Path("outputs/deforum-merged-previews/WOMANS_MORPH_figures")
OUTDIR = Path("outputs/deforum-merged-previews/WOMANS_FIGURE_MORPH_raw_v2")
W, H = 576, 1024  # Forge working size; upscaled to 720x1280 at assembly
STEPS_PER_TRANSITION = 18  # 3 seconds at 6 fps raw
# Denoise ramps up mid-transition so Forge resolves the 50/50 blend into a
# coherent recognizable figure instead of abstract texture.
DENOISE_EDGE = 0.35
DENOISE_MID = 0.60
SD_STEPS = 24
SEED_BASE = 21082601

PROMPT = (
    "one elegant woman, full figure clearly visible, recognizable female silhouette, "
    "face and body well defined, glowing CRT phosphor aesthetic, cinematic light, "
    "coherent single figure, high detail"
)
NEGATIVE = (
    "text, watermark, signature, logo, extra limbs, extra head, missing limbs, "
    "malformed anatomy, deformed face, two people, multiple faces, duplicate, "
    "double exposure, ghosting, blurry, low quality"
)


def encode_png(image):
    ok, buf = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("encode failed")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def img2img(init_b64, denoise, seed, retries=6):
    payload = {
        "init_images": [init_b64],
        "prompt": PROMPT,
        "negative_prompt": NEGATIVE,
        "denoising_strength": denoise,
        "steps": SD_STEPS,
        "cfg_scale": 5.5,
        "width": W,
        "height": H,
        "sampler_name": "Euler a",
        "scheduler": "automatic",
        "seed": seed,
        "batch_size": 1,
        "n_iter": 1,
        "save_images": False,
    }
    req = urllib.request.Request(
        FORGE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json; charset=utf-8"},
    )
    last = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            b64 = result.get("images", [None])[0]
            if not b64:
                raise RuntimeError("Forge returned no image")
            data = np.frombuffer(base64.b64decode(b64.split(",", 1)[-1]), dtype=np.uint8)
            decoded = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if decoded is None:
                raise RuntimeError("undecodable image")
            return decoded
        except Exception as e:  # noqa: BLE001 - transient Forge/CUDA blips
            last = e
            wait = 15 * attempt
            print(f"  img2img attempt {attempt}/{retries} failed: {e!r} -> retry in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"img2img failed after {retries} attempts: {last}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--figures", type=int, default=4, help="number of figures to morph through (test=4, full=6)")
    args = parser.parse_args()

    OUTDIR.mkdir(parents=True, exist_ok=True)
    figures = []
    for k in range(1, args.figures + 1):
        img = cv2.imread(str(FIGDIR / f"figure_{k}.png"))
        if img is None:
            raise FileNotFoundError(FIGDIR / f"figure_{k}.png")
        figures.append(cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA))

    n_transitions = len(figures) - 1
    total = n_transitions * (STEPS_PER_TRANSITION - 1)
    done = 0
    for i in range(n_transitions):
        a = figures[i].astype(np.float32)
        b = figures[i + 1].astype(np.float32)
        for j in range(1, STEPS_PER_TRANSITION):
            done += 1
            out_path = OUTDIR / f"morph_t{i + 1:02d}_s{j:02d}.png"
            if out_path.exists():
                continue
            t = j / STEPS_PER_TRANSITION
            blend = np.clip(a * (1 - t) + b * t, 0, 255).astype(np.uint8)
            denoise = DENOISE_EDGE + (DENOISE_MID - DENOISE_EDGE) * float(np.sin(np.pi * t))
            fused = img2img(encode_png(blend), round(denoise, 3), SEED_BASE + i)
            cv2.imwrite(str(out_path), fused)
            print(f"[{done}/{total}] transition {i + 1} step {j} written", flush=True)

    print("raw morph frames complete:", total)


if __name__ == "__main__":
    main()
