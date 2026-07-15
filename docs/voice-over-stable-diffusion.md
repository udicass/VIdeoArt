# Voice Over Stable Diffusion Lite

This repo now derives a lightweight storyboard from Voice Over mode instead of assuming full diffusion on every frame.

## Goal

Use the existing narration beats from Voice Over mode to generate:

- semantic scene segments
- Stable Diffusion keyframe prompts
- a Deforum-friendly prompt schedule
- low-compute motion guidance for in-between frames

The design avoids the expensive path of rendering every frame with diffusion.

## Runtime Flow

1. Voice Over runs as usual in `src/main.js`.
2. The generated narration beats are passed to `buildVoiceOverStoryboard()` in `src/voiceOverStoryboard.js`.
3. The app caches the latest plan in memory as `window.__lastVoiceOverStoryboard`.
4. Use chat commands to export artifacts:
   - `/storyboard` for a summary
   - `/storyboard json` for the structured timeline
   - `/storyboard txt` for the prompt schedule
5. Generate keyframes with a local SD backend:
   - `npm run voiceover:keyframes -- --storyboard <file.json> --out-dir <dir>`
6. Render an animatic from exported keyframes with:
   - `npm run voiceover:render -- --storyboard <file.json> --frames-dir <dir> --audio <voiceover.wav> --out <file.mp4>`

## Render Strategy

Recommended low-compute pipeline:

1. Render only the listed keyframes.
2. Use SD 1.5, SDXL Turbo, Lightning, or another fast model.
3. Keep img2img denoise around `0.20-0.34`.
4. Animate between keyframes using pan, push, tilt, warp, optical flow, or RIFE.
5. Re-run diffusion only when a new scene segment starts or continuity breaks.

## Local Backend Commands

Your machine already has a Forge/Deforum install at `D:\SD_Deforum_Fresh`. Its launcher points to `http://127.0.0.1:7860`, which matches the Automatic1111 bridge in this repo.

One-command local pipeline for that install:

`npm run voiceover:deforum -- --Storyboard outputs/my-storyboard.json --Audio outputs/voiceover.wav --FramesDir outputs/keyframes --Out outputs/voiceover-deforum.mp4`

This wrapper:

- checks whether the Forge API is reachable at `127.0.0.1:7860`
- starts `D:\SD_Deforum_Fresh\Launch_Deforum.bat` if Forge is offline
- generates keyframes through the running Forge server
- renders the final motion animatic with the local audio file

Automatic1111 direct rendering:

`npm run voiceover:keyframes -- --storyboard outputs/my-storyboard.json --out-dir outputs/keyframes --provider automatic1111 --base-url http://127.0.0.1:7860`

ComfyUI rendering with a workflow template:

`npm run voiceover:keyframes -- --storyboard outputs/my-storyboard.json --out-dir outputs/keyframes --provider comfyui --base-url http://127.0.0.1:8188 --workflow docs/comfyui-voice-template.json`

The starter template file lives at `docs/comfyui-voice-template.json`. Change `ckpt_name` to a checkpoint you actually have installed.

The ComfyUI workflow template can include these placeholders anywhere in the JSON:

- `__PROMPT__`
- `__NEGATIVE_PROMPT__`
- `__WIDTH__`
- `__HEIGHT__`
- `__SEED__`
- `__STEPS__`
- `__CFG__`
- `__SAMPLER__`

## Why This Is Cheap

- The narration already gives scene boundaries.
- Most frames are synthesized through motion, not generation.
- Prompt changes happen on semantic beats, not fixed frame intervals.
- Deforum can consume the prompt schedule without forcing full per-frame regeneration.

## Export Shape

The JSON export contains:

- `render`: fps, size, total frames, and suggested strategy
- `source`: theme, lead, world, references
- `segments`: one entry per narration beat
- `deforumPromptSchedule`: `frame: prompt` lines ready for downstream tools

Each segment includes:

- time range and frame range
- positive and negative prompts
- motion type
- seed
- denoise strength
- guidance scale

## Suggested Downstream Use

If you want a first-pass renderer outside the browser, consume the JSON like this:

1. Read each segment.
2. Render one still at `keyframe` using the positive and negative prompt.
3. Apply the listed motion for the segment duration.
4. Interpolate the intermediate frames.
5. Stitch with `ffmpeg`.

This keeps the creative control tied to Voice Over mode while staying within modest GPU budgets.

## Keyframe Naming

The renderer expects images named after storyboard segment ids, for example:

- `vo-segment-01.png`
- `vo-segment-02.png`
- `vo-segment-03.png`

Supported extensions are `png`, `jpg`, `jpeg`, and `webp`.

## Motion Rendering

`voiceover:render` now turns each still into a short motion clip using the storyboard motion field:

- `slow_push_in`
- `micro_push_in`
- `left_pan`
- `drift_left`
- `drift_right`
- `tilt_up`
- `tilt_down`
- `hold_breath`

Use `--motion-mode none` if you want plain static holds for debugging.