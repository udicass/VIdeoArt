---
name: video-pipeline
description: "Run and validate VideoArt media workflows. Use for Forge, Deforum, VOC, CUDA generation, frame interpolation, overlays, resumable batches, and video metadata checks."
argument-hint: "Describe the source movie, duration, dimensions, and desired VOC/Deforum output"
---

# Video Pipeline

Use this workflow for Synthetic Desires and related VideoArt rendering tasks.

## Standard Pipeline

1. Resolve the source under `Video/` and preserve the original media.
2. Confirm Forge is available at `http://127.0.0.1:7860` and uses `cuda:0`.
3. Loop or trim to the requested duration.
4. Normalize dimensions and frame rate for the target workflow.
5. Generate or stylize frames with resumable output directories.
6. Interpolate and encode to a newly named output file.
7. Validate duration, dimensions, frame rate, and frame count with `ffprobe`.
8. Produce synchronized contact sheets for visual review.

## Commands

Run the general Synthetic Desires pipeline:

```powershell
node scripts/run-pipeline.mjs Synthetic_Desires_4 --frames 720 --fps 6
```

Use `--dry-run` to resolve inputs and inspect arguments without contacting Forge.

Run the Androids Dream single-figure VOC and Deforum workflow:

```powershell
npm run androids:single-figure
```

## Reliability Rules

- Do not delete completed frames after a Forge interruption.
- Resume from existing valid frame files after restarting Forge.
- Write revised media to new filenames; do not replace accepted renders.
- Keep VOC and Deforum geometrically aligned but visually distinguishable.
- Keep Androids Dream VOC and Deforum as separate outputs; do not create an overlay unless explicitly requested.
- Do not accept a render from metadata alone; inspect the contact sheet.
