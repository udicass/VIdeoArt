import base64
import json
import urllib.request
from pathlib import Path

source = Path("outputs/deforum-merged-previews/CARA_keyframes_upscaled")
output = Path("outputs/deforum-merged-previews/CARA_keyframes_refined_v2")
output.mkdir(parents=True, exist_ok=True)

style = "gray-blue CRT pixel art, cyan rim glow, dark teal dot-matrix background, high quality, sharp clear detail"
negative = (
    "camera, lens, machine, machinery, device, equipment, robot, vehicle, object, text, watermark, "
    "illustration style change, different figure, extra limbs, extra head, missing limbs, malformed anatomy, "
    "blurry, soft focus, low detail, artifacts"
)

for index in range(3, 25):
    path = source / f"keyframe_{index:04d}.png"
    out_path = output / f"keyframe_{index:04d}.png"
    if out_path.exists():
        print("skip", index)
        continue
    with open(path, "rb") as fh:
        init_b64 = base64.b64encode(fh.read()).decode()
    payload = {
        "init_images": [init_b64],
        "prompt": style,
        "negative_prompt": negative,
        "denoising_strength": 0.28,
        "steps": 28,
        "cfg_scale": 6,
        "width": 720,
        "height": 1280,
        "sampler_name": "DPM++ 2M",
        "scheduler": "Karras",
        "restore_faces": False,
        "seed": 14700000 + index,
        "batch_size": 1,
        "n_iter": 1,
        "save_images": False,
    }
    request = urllib.request.Request(
        "http://127.0.0.1:7860/sdapi/v1/img2img",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.loads(response.read().decode())
    encoded = result.get("images", [None])[0]
    if not encoded:
        raise RuntimeError(f"keyframe {index}: no image returned")
    if encoded.startswith("data:image"):
        encoded = encoded.split(",", 1)[1]
    with open(out_path, "wb") as fh:
        fh.write(base64.b64decode(encoded))
    print("refined", index)

print("refine v2 done")
