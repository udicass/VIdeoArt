import base64
import json
import shutil
import urllib.request
from pathlib import Path

getup = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_GETUP_KEYFRAMES_V143_20SEC")
fixed = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_GETUP_KEYFRAMES_V146_FIXED")
scenes = Path(r"D:\SD_Deforum_Fresh\outputs\androids-text-frames\2026-08-18\CARA_SCENES_V145")
combined = Path("outputs/deforum-merged-previews/CARA_keyframes_combined")
combined.mkdir(parents=True, exist_ok=True)

for k in range(1, 25):
    if k in (5, 6, 7, 8):
        source = fixed / f"keyframe_{k:04d}.png"
    elif k <= 14:
        source = getup / f"keyframe_{k:04d}.png"
    else:
        source = scenes / f"keyframe_{k:04d}.png"
    shutil.copy(str(source), str(combined / f"keyframe_{k:04d}.png"))

print("combined", len(list(combined.glob("*.png"))))

upscaled = Path("outputs/deforum-merged-previews/CARA_keyframes_upscaled")
upscaled.mkdir(parents=True, exist_ok=True)

for k in range(1, 25):
    path = combined / f"keyframe_{k:04d}.png"
    out_path = upscaled / f"keyframe_{k:04d}.png"
    if out_path.exists():
        print("skip upscale", k)
        continue
    with open(path, "rb") as fh:
        image_b64 = base64.b64encode(fh.read()).decode()
    payload = {
        "resize_mode": 0,
        "show_extras_results": True,
        "gfpgan_visibility": 0,
        "codeformer_visibility": 0,
        "codeformer_weight": 0,
        "upscaling_resize": 2,
        "upscaling_resize_w": 1152,
        "upscaling_resize_h": 2048,
        "upscaling_crop": True,
        "upscaler_1": "R-ESRGAN 4x+",
        "upscaler_2": "None",
        "extras_upscaler_2_visibility": 0,
        "upscale_first": False,
        "image": image_b64,
    }
    request = urllib.request.Request(
        "http://127.0.0.1:7860/sdapi/v1/extra-single-image",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        result = json.loads(response.read().decode())
    result_b64 = result.get("image", "")
    if not result_b64:
        raise RuntimeError(f"no image for keyframe {k}: {result.get('info')}")
    with open(out_path, "wb") as fh:
        fh.write(base64.b64decode(result_b64))
    print("upscaled", k)

print("upscaled done")
