import base64
import json
import urllib.request

init_path = r"D:\Users\User\Sonar\VIdeoArt\outputs\deforum-merged-previews\antelope.png"
with open(init_path, "rb") as fh:
    init_b64 = base64.b64encode(fh.read()).decode()

payload = {
    "init_images": [init_b64],
    "prompt": "pixel art antelope, cyan glow, high quality",
    "negative_prompt": "camera, text, watermark",
    "denoising_strength": 0.5,
    "steps": 8,
    "cfg_scale": 5,
    "width": 512,
    "height": 512,
    "sampler_name": "Euler",
    "scheduler": "Karras",
}
req = urllib.request.Request(
    "http://127.0.0.1:7860/sdapi/v1/img2img",
    data=json.dumps(payload).encode(),
    headers={"content-type": "application/json; charset=utf-8"},
)
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read().decode())
    print("OK images:", len(result.get("images", [])))
except Exception as exc:
    print("IMG2IMG ERROR:", exc)
    if hasattr(exc, "read"):
        print(exc.read().decode()[:2000])

