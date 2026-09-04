"""Generate a clean 20-second Botticelli-inspired portrait morph from WOMANS.png."""
import base64
import json
import math
import urllib.request
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS" / "WOMANS.png"
KEYDIR = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS_BOTTICELLI_V5_1280_KEYFRAMES"
FRAMEDIR = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS_BOTTICELLI_V5_1280_20SEC_frames"
VIDEO = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS_BOTTICELLI_V5_1280_MORPH_20SEC.mp4"
CONTACT = ROOT / "outputs" / "deforum-merged-previews" / "WOMANS_BOTTICELLI_V5_1280_MORPH_20SEC_contact.jpg"

API = "http://127.0.0.1:7860/sdapi/v1/img2img"
WIDTH, HEIGHT, FPS, TOTAL_FRAMES = 1280, 1280, 12, 240

STYLE = (
    "Botticelli-inspired early Renaissance tempera portrait, graceful flowing hair, delicate botanical linework, "
    "soft pearl skin, muted ultramarine and sage green, warm ivory background, fine handmade brushwork, "
    "calm elegant expression, harmonious composition, museum-quality Renaissance painting"
)
SCENES = [
    "the same woman as a serene Renaissance Madonna-like portrait, centered, quiet gaze, pale blue mantle",
    "the same woman in profile with flowing golden hair, laurel leaves and small white flowers",
    "the same woman in an allegorical spring garden, lilies and roses, gentle three-quarter pose",
    "the same woman surrounded by graceful windblown ribbons and botanical stems, lyrical movement",
    "the same woman beside a calm sea, translucent veil, distant Tuscan landscape, soft afternoon light",
    "the same woman serene and luminous, floral wreath framing her face, balanced Renaissance composition",
]
NEGATIVE = (
    "text, watermark, logo, signature, two people, multiple faces, duplicate, double exposure, ghosting, "
    "extra limbs, malformed anatomy, deformed face, melted face, asymmetrical eyes, blurry, low quality, "
    "photograph, camera, modern clothing, neon, cyberpunk, glossy digital render, harsh contrast, "
    "visible noise, grain, speckles, compression artifacts, oversharpening, oversaturated colors"
)


def cover_resize(image):
    height, width = image.shape[:2]
    target_aspect = WIDTH / HEIGHT
    aspect = width / height
    if aspect > target_aspect:
        crop_width = int(height * target_aspect)
        x0 = (width - crop_width) // 2
        image = image[:, x0:x0 + crop_width]
    else:
        crop_height = int(width / target_aspect)
        y0 = (height - crop_height) // 2
        image = image[y0:y0 + crop_height]
    return cv2.resize(image, (WIDTH, HEIGHT), interpolation=cv2.INTER_LANCZOS4)


def encode(image):
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("Could not encode image")
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def generate_keyframe(source_b64, prompt, seed):
    payload = {
        "init_images": [source_b64],
        "prompt": f"the same woman from the input image, same identity and portrait framing, {prompt}, {STYLE}",
        "negative_prompt": NEGATIVE,
        "denoising_strength": 0.60,
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
    }
    request = urllib.request.Request(
        API,
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json; charset=utf-8"},
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        result = json.loads(response.read().decode("utf-8"))
    encoded = result.get("images", [None])[0]
    if not encoded:
        raise RuntimeError("Forge returned no keyframe")
    data = np.frombuffer(base64.b64decode(encoded.split(",", 1)[-1]), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError("Forge returned an undecodable keyframe")
    return cover_resize(image)


def grade(image, scene_index):
    """Add a consistent cool neon finish without changing facial geometry."""
    image = image.astype(np.float32)
    blue, green, red = cv2.split(image)
    blue *= 1.04 + scene_index * 0.01
    red *= 0.94 + scene_index * 0.012
    result = cv2.merge((blue, green, red))
    return np.clip(result, 0, 255).astype(np.uint8)


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    KEYDIR.mkdir(parents=True, exist_ok=True)
    FRAMEDIR.mkdir(parents=True, exist_ok=True)
    source = cover_resize(cv2.imread(str(SOURCE)))
    source_b64 = encode(source)

    keyframes = []
    for index, scene in enumerate(SCENES):
        path = KEYDIR / f"keyframe_{index + 1:02d}.png"
        if path.exists():
            image = cv2.imread(str(path))
        else:
            print(f"Generating keyframe {index + 1}/{len(SCENES)}", flush=True)
            image = generate_keyframe(source_b64, scene, 22082600 + index)
            cv2.imwrite(str(path), image)
        if image is None:
            raise RuntimeError(f"Unreadable keyframe: {path}")
        keyframes.append(grade(cover_resize(image), index))

    transition_frames = 12
    hold_frames = (TOTAL_FRAMES - transition_frames * (len(keyframes) - 1)) // len(keyframes)
    frame_index = 0
    for scene_index, current in enumerate(keyframes):
        next_image = keyframes[min(scene_index + 1, len(keyframes) - 1)]
        for _ in range(hold_frames):
            frame_index += 1
            cv2.imwrite(str(FRAMEDIR / f"frame_{frame_index:04d}.png"), current)
        if scene_index == len(keyframes) - 1:
            break
        for step in range(transition_frames):
            t = (step + 1) / (transition_frames + 1)
            eased = 0.5 - 0.5 * math.cos(math.pi * t)
            frame_index += 1
            morph = cv2.addWeighted(current, 1 - eased, next_image, eased, 0)
            cv2.imwrite(str(FRAMEDIR / f"frame_{frame_index:04d}.png"), morph)

    print(f"Wrote {frame_index} frames to {FRAMEDIR}")
    print(f"Encode with: ffmpeg -y -framerate {FPS} -i {FRAMEDIR / 'frame_%04d.png'} -c:v libx264 -crf 18 -pix_fmt yuv420p {VIDEO}")
    print(f"Contact sheet: ffmpeg -y -v error -i {VIDEO} -vf \"select='not(mod(n,36))',scale=180:320,tile=4x2\" -frames:v 1 {CONTACT}")


if __name__ == "__main__":
    main()