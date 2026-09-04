"""Generate a 40-second Botticelli-inspired scene where the women rise and move."""
import base64
import json
import math
import urllib.request
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS_V14_STYLE_ANCHOR.png"
KEYDIR = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS_V14_MOVEMENT_V20_POSE_GUIDED_40SEC_KEYFRAMES"
FRAMEDIR = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS_V14_MOVEMENT_V20_POSE_GUIDED_40SEC_frames"
WIDTH = HEIGHT = 1280
FPS = 12
TOTAL_FRAMES = 480
API = "http://127.0.0.1:7860/sdapi/v1/img2img"

STYLE = (
    "Botticelli-inspired early Renaissance tempera painting, graceful flowing hair, delicate botanical linework, "
    "soft pearl skin, muted ultramarine and sage green, warm ivory background, fine handmade brushwork, "
    "harmonious composition, museum-quality Renaissance painting"
)
SCENES = [
    "the same three women seated peacefully around the table",
    "the same three women actively rising from their chairs, half-standing, hands pushing off the table",
    "the same three women fully standing beside the table, full-body upright poses, flowing dresses",
    "the same three women walking through the flower garden, full-body movement, flowing hair and dresses",
    "the same three women dancing gently among lilies and roses, arms extended, lyrical full-body motion",
]
POSES = [
    [(250, 420, 250, 570, 215, 640, 285, 640), (640, 400, 640, 560, 605, 635, 675, 635), (1030, 430, 1030, 580, 995, 650, 1065, 650)],
    [(250, 420, 250, 560, 215, 640, 285, 640), (640, 400, 640, 550, 605, 635, 675, 635), (1030, 430, 1030, 570, 995, 650, 1065, 650)],
    [(250, 420, 250, 545, 220, 620, 280, 620), (640, 400, 640, 535, 610, 610, 670, 610), (1030, 430, 1030, 555, 1000, 630, 1060, 630)],
    [(250, 420, 250, 520, 210, 700, 290, 700), (640, 400, 640, 515, 595, 700, 685, 700), (1030, 430, 1030, 530, 985, 710, 1075, 710)],
    [(250, 420, 250, 520, 175, 610, 325, 560), (640, 400, 640, 515, 560, 610, 720, 555), (1030, 430, 1030, 530, 960, 600, 1110, 555)],
    [(250, 420, 250, 520, 175, 610, 325, 560), (640, 400, 640, 515, 560, 610, 720, 555), (1030, 430, 1030, 530, 960, 600, 1110, 555)],
]
NEGATIVE = (
    "text, watermark, logo, signature, extra people, extra women, duplicate faces, double exposure, ghosting, "
    "extra limbs, missing limbs, malformed anatomy, deformed hands, fused bodies, blurry, noisy, grain, "
    "photograph, modern clothing, neon, cyberpunk, digital render, harsh contrast, cropped heads, "
    "collage, grid, multiple panels, tiled composition"
)


def square(image):
    height, width = image.shape[:2]
    side = min(height, width)
    y0, x0 = (height - side) // 2, (width - side) // 2
    return cv2.resize(image[y0:y0 + side, x0:x0 + side], (WIDTH, HEIGHT), interpolation=cv2.INTER_LANCZOS4)


def encode(image):
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode source")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def pose_map(index):
    image = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    for points in POSES[index]:
        neck_x, neck_y, hip_x, hip_y, left_x, left_y, right_x, right_y = points
        joints = [(neck_x, neck_y), (hip_x, hip_y), (left_x, left_y), (right_x, right_y)]
        for start, end in ((joints[0], joints[1]), (joints[1], joints[2]), (joints[1], joints[3])):
            cv2.line(image, start, end, (255, 255, 255), 14, cv2.LINE_AA)
        cv2.circle(image, (neck_x, neck_y - 55), 35, (255, 255, 255), -1, cv2.LINE_AA)
    return image


def generate(source_b64, scene, pose_index, seed):
    payload = {
        "init_images": [source_b64],
        "prompt": f"the same group of women from the input image, preserve their identities and garden setting, {scene}, {STYLE}",
        "negative_prompt": NEGATIVE,
        "denoising_strength": 0.45,
        "steps": 36,
        "cfg_scale": 5.5,
        "width": WIDTH,
        "height": HEIGHT,
        "sampler_name": "DPM++ 2M",
        "scheduler": "Karras",
        "seed": seed,
        "batch_size": 1,
        "n_iter": 1,
        "restore_faces": False,
        "save_images": False,
        "alwayson_scripts": {
            "ControlNet": {
                "args": [{
                    "enabled": True,
                    "module": "none",
                    "model": "control_v11p_sd15_openpose [cab727d4]",
                    "weight": 0.65,
                    "image": encode(pose_map(pose_index)),
                    "resize_mode": "Crop and Resize",
                    "lowvram": False,
                    "processor_res": 512,
                    "threshold_a": 64,
                    "threshold_b": 64,
                    "guidance_start": 0.0,
                    "guidance_end": 1.0,
                    "control_mode": "Balanced",
                }]
            }
        },
    }
    request = urllib.request.Request(API, data=json.dumps(payload).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=600) as response:
        result = json.loads(response.read().decode())
    encoded = result.get("images", [None])[0]
    if not encoded:
        raise RuntimeError("Forge returned no image")
    data = np.frombuffer(base64.b64decode(encoded.split(",", 1)[-1]), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError("Forge returned an undecodable image")
    return square(image)


def main():
    source = square(cv2.imread(str(SOURCE)))
    if source is None:
        raise FileNotFoundError(SOURCE)
    KEYDIR.mkdir(parents=True, exist_ok=True)
    FRAMEDIR.mkdir(parents=True, exist_ok=True)
    source_b64 = encode(source)
    keyframes = [source]
    for index, scene in enumerate(SCENES[1:], start=1):
        path = KEYDIR / f"keyframe_{index + 1:02d}.png"
        image = cv2.imread(str(path)) if path.exists() else generate(source_b64, scene, index, 22082700 + index)
        if not path.exists():
            cv2.imwrite(str(path), image)
        keyframes.append(image)

    transition_frames = 24
    hold_frames = (TOTAL_FRAMES - transition_frames * (len(keyframes) - 1)) // len(keyframes)
    frame_index = 0
    for index, current in enumerate(keyframes):
        next_image = keyframes[min(index + 1, len(keyframes) - 1)]
        for _ in range(hold_frames):
            frame_index += 1
            cv2.imwrite(str(FRAMEDIR / f"frame_{frame_index:04d}.png"), current)
        if index == len(keyframes) - 1:
            break
        for step in range(transition_frames):
            t = (step + 1) / (transition_frames + 1)
            eased = 0.5 - 0.5 * math.cos(math.pi * t)
            frame_index += 1
            cv2.imwrite(str(FRAMEDIR / f"frame_{frame_index:04d}.png"), cv2.addWeighted(current, 1 - eased, next_image, eased, 0))
    print(f"Wrote {frame_index} frames to {FRAMEDIR}")


if __name__ == "__main__":
    main()