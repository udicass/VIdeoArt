import argparse
import base64
import json
import urllib.request
from pathlib import Path

import cv2
import numpy as np


FORGE_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"

NEUTRAL_PROMPT = (
    "one solitary human woman, single centered head-and-shoulders portrait, "
    "same face at identical scale and position, coherent anatomy, smooth skin, "
    "muted blue CRT tint, soft analog portrait, plain dark background"
)
NEGATIVE_PROMPT = (
    "text, watermark, two people, multiple faces, second face, duplicate, "
    "double exposure, ghosting, extra eyes, deformed, melted face, collage"
)


def encode_png(image):
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode blended frame")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def img2img(init_b64, denoise, steps, seed):
    payload = {
        "init_images": [init_b64],
        "prompt": NEUTRAL_PROMPT,
        "negative_prompt": NEGATIVE_PROMPT,
        "denoising_strength": denoise,
        "steps": steps,
        "cfg_scale": 6.0,
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
        result = json.loads(response.read().decode("utf-8"))
    image_b64 = result.get("images", [None])[0]
    if not image_b64:
        raise RuntimeError("Forge returned no image")
    image_b64 = image_b64.split(",", 1)[-1]
    data = np.frombuffer(base64.b64decode(image_b64), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--steps-per-transition", type=int, default=15)
    parser.add_argument("--denoise", type=float, default=0.35)
    parser.add_argument("--steps", type=int, default=20)
    parser.add_argument("--seed", type=int, default=713068000)
    args = parser.parse_args()

    frames = sorted(args.input.glob("single_figure_*.png"))
    if len(frames) != 12:
        raise RuntimeError(f"Expected 12 faces, found {len(frames)}")
    faces = [cv2.imread(str(path)) for path in frames]
    if any(face is None for face in faces):
        raise RuntimeError("Could not read one or more faces")

    args.output.mkdir(parents=True, exist_ok=True)
    steps_per = args.steps_per_transition
    frame_index = 0
    for i in range(len(faces)):
        face_a = faces[i]
        face_b = faces[(i + 1) % len(faces)]
        for j in range(steps_per):
            frame_index += 1
            out_path = args.output / f"morph_{frame_index:04d}.png"
            if out_path.exists():
                print(f"skip {out_path.name}")
                continue
            t = j / float(steps_per)
            blended = cv2.addWeighted(face_a, 1.0 - t, face_b, t, 0.0)
            fused = img2img(encode_png(blended), args.denoise, args.steps, args.seed)
            if not cv2.imwrite(str(out_path), fused):
                raise RuntimeError(f"Could not write {out_path}")
            print(f"morph {out_path.name} pair={i}->{(i + 1) % len(faces)} t={t:.2f}")

    print(f"DONE total_frames={frame_index}")


if __name__ == "__main__":
    main()
