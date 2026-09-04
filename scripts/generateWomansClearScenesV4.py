import base64
import json
import urllib.request
from pathlib import Path

import cv2
import numpy as np

SOURCE = Path(r"D:\Users\User\Sonar\VIdeoArt\outputs\deforum-merged-previews\WOMANS\WOMANS.png")
OUTDIR = Path("outputs/deforum-merged-previews/WOMANS_clear_keyframes_v4")
OUTDIR.mkdir(parents=True, exist_ok=True)

W, H = 576, 1024

# CLEAR style: no CRT / pixel / scanline effects, sharp recognizable face.
STYLE = (
    "clear high-definition portrait, sharp focus, detailed recognizable face, "
    "soft natural lighting, clean composition, high quality"
)
SCENES = [
    "the same woman, elegant head-and-shoulders studio portrait, soft diffused light, plain light-gray background",
    "the same woman, gentle profile view looking to the left, soft window light",
    "the same woman, reading a book by a window, warm afternoon light, cozy",
    "the same woman, standing in a blooming spring meadow, soft petals in the air",
    "the same woman, looking up at falling cherry blossoms, soft pink light",
    "the same woman, confident three-quarter view, clean studio backdrop, bright clear lighting",
    "the same woman, laughing softly, candid moment, soft daylight",
    "the same woman, looking over her shoulder, cinematic light",
    "the same woman, holding a cup of tea, warm cozy kitchen light",
    "the same woman, walking through autumn leaves, golden hour",
    "the same woman, serene by a calm lake at dusk, soft reflections",
    "the same woman, gentle smile, eyes open, centered portrait, bright studio light",
]
NEGATIVE = (
    "text, watermark, signature, logo, extra limbs, extra head, missing limbs, malformed anatomy, deformed face, "
    "two people, multiple faces, duplicate, double exposure, ghosting, camera, lens, blurry, low quality, "
    "pixelation, mosaic, blocky, low resolution, melted face, warped face, "
    "scanlines, crt, glitch, retro, pixel art, noise, dark, underexposed, oversaturated"
)


def cover_resize(image, target_w, target_h):
    h, w = image.shape[:2]
    target_aspect = target_w / target_h
    aspect = w / h
    if aspect > target_aspect:
        new_w = int(h * target_aspect)
        x0 = (w - new_w) // 2
        image = image[:, x0 : x0 + new_w]
    else:
        new_h = int(w / target_aspect)
        y0 = (h - new_h) // 2
        image = image[y0 : y0 + new_h]
    return cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)


source = cv2.imread(str(SOURCE))
if source is None:
    raise RuntimeError(f"Missing source: {SOURCE}")
normalized = cover_resize(source, W, H)
_, buffer = cv2.imencode(".png", normalized)
init_b64 = base64.b64encode(buffer.tobytes()).decode("ascii")

for index, scene in enumerate(SCENES, start=1):
    out_path = OUTDIR / f"keyframe_{index:04d}.png"
    if out_path.exists():
        print("skip", index)
        continue
    payload = {
        "init_images": [init_b64],
        "prompt": f"{scene}, {STYLE}",
        "negative_prompt": NEGATIVE,
        "denoising_strength": 0.50,
        "steps": 36,
        "cfg_scale": 6,
        "width": W,
        "height": H,
        "sampler_name": "DPM++ 2M",
        "scheduler": "Karras",
        "restore_faces": False,
        "seed": 27092000 + index,
        "batch_size": 1,
        "n_iter": 1,
        "save_images": False,
    }
    request = urllib.request.Request(
        "http://127.0.0.1:7860/sdapi/v1/img2img",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        result = json.loads(response.read().decode())
    encoded = result.get("images", [None])[0]
    if not encoded:
        raise RuntimeError(f"keyframe {index}: no image returned")
    if encoded.startswith("data:image"):
        encoded = encoded.split(",", 1)[1]
    with open(out_path, "wb") as fh:
        fh.write(base64.b64decode(encoded))
    print("generated", index)

print("clear keyframes v4 done")
