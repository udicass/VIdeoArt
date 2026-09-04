"""Generate a 20-second AI continuation from the final WOMANS morph frame."""
from pathlib import Path
import base64
import json
import time
import urllib.request

import cv2
import numpy as np

FORGE_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"
SOURCE = Path("outputs/deforum-merged-previews/_womans_morph_10sec_mci_last.png")
OUTDIR = Path("outputs/deforum-merged-previews/WOMANS_MORPH_AI_THINKING_V2_20SEC_frames")
W, H = 576, 1024
FPS = 6
TOTAL_FRAMES = 120
STEPS = 22
DENOISE = 0.58
SEED_BASE = 21082101

NEGATIVE = (
    "text, watermark, signature, logo, subtitles, extra limbs, extra head, "
    "missing limbs, malformed anatomy, deformed face, two people, duplicate, "
    "double exposure, ghosting, hard rectangle, blurry, low quality"
)

PROMPTS = [
    "the same abstract CRT water and gold light field, bright particles slowly arranging into a human silhouette, cinematic synthetic memory",
    "the same woman emerging from the shimmering CRT water, full figure, recognizable face, looking inward as if thinking, quiet cinematic light",
    "the same woman in a dark reflective room, seated and deeply contemplative, glowing thoughts suggested by drifting phosphor particles, coherent anatomy",
    "the same woman looking at a luminous water reflection, calm intelligent expression, subtle cyan and amber CRT phosphor texture, cinematic still",
    "the woman dissolving gently into gold water and white particles, contemplative memory returning to an abstract CRT landscape, coherent continuous surfaces",
]


def encode_image(image):
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("could not encode image")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def generate(init_image, prompt, seed):
    payload = {
        "init_images": [encode_image(init_image)],
        "prompt": f"{prompt}, portrait composition, soft film texture, detailed but coherent",
        "negative_prompt": NEGATIVE,
        "denoising_strength": DENOISE,
        "steps": STEPS,
        "cfg_scale": 5.5,
        "width": W,
        "height": H,
        "sampler_name": "Euler a",
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
    for attempt in range(1, 7):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                result = json.loads(response.read().decode("utf-8"))
            encoded = result.get("images", [None])[0]
            if not encoded:
                raise RuntimeError("Forge returned no image")
            data = np.frombuffer(base64.b64decode(encoded.split(",", 1)[-1]), dtype=np.uint8)
            decoded = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if decoded is None:
                raise RuntimeError("Forge returned an undecodable image")
            return decoded
        except Exception as error:  # transient Forge/CUDA failures are retryable
            last_error = error
            wait = 10 * attempt
            print(f"frame retry {attempt}/6: {error!r}; waiting {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"Forge failed after retries: {last_error}")


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    OUTDIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(OUTDIR.glob("frame_*.png"))
    if existing:
        current = cv2.imread(str(existing[-1]), cv2.IMREAD_COLOR)
        start = int(existing[-1].stem.split("_")[-1])
        if current is None:
            raise RuntimeError(f"cannot read {existing[-1]}")
    else:
        source = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
        if source is None:
            raise RuntimeError(f"cannot read {SOURCE}")
        current = cv2.resize(source, (W, H), interpolation=cv2.INTER_AREA)
        start = 0

    for frame_number in range(start + 1, TOTAL_FRAMES + 1):
        progress = (frame_number - 1) / max(1, TOTAL_FRAMES - 1)
        stage = min(len(PROMPTS) - 1, int(progress * len(PROMPTS)))
        anchor = cv2.resize(cv2.imread(str(SOURCE), cv2.IMREAD_COLOR), (W, H), interpolation=cv2.INTER_AREA)
        current = cv2.addWeighted(current, 0.75, anchor, 0.25, 0)
        current = generate(current, PROMPTS[stage], SEED_BASE + frame_number)
        cv2.imwrite(str(OUTDIR / f"frame_{frame_number:04d}.png"), current)
        print(f"AI continuation frame {frame_number}/{TOTAL_FRAMES}", flush=True)

    print(f"Generated {TOTAL_FRAMES} frames at {FPS} fps: {OUTDIR}")


if __name__ == "__main__":
    main()
