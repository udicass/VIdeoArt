# VideoArt & CUDA Media Pipeline Instructions

## 1. Context & Token Management (CRITICAL)
* **Zero History Replay:** Always assume the user has started a fresh, single-intent chat session to minimize token overhead. Never reference past sessions or versions (e.g., V1 to V13) unless explicitly provided in the active prompt.
* **Concise Code Outputs:** Do not generate full-file templates unless requested. Provide only the updated lines, specific FFmpeg flags, or targeted C# CUDA kernel wrappers.

## 2. Media Contract Specifications (WOMANS Standard)
Every video art pipeline execution must conform to these strict architectural bounds unless specified otherwise by an explicit Render Brief:
* **Resolution:** Strictly `1280x1280` (1:1 Square aspect ratio). Never stretch, scale, or introduce padding artifacting.
* **Duration Specs:** Exactly `20 seconds` @ `12 fps` = `240 frames` total.
* **Motion Configuration:** Pure morphing loop. Camera translation vectors (X,Y,Z) and rotational matrices must remain hard-coded to `0`.

## 3. Render Quality & Artifact Controls
When generating or editing prompt pipelines or post-processing chains, enforce the following quality controls:
* **Noise Topologies:** Favor `uniform` noise profiles over `perlin` waves to prevent structural disintegration of high-frequency botanical backgrounds.
* **Color Space Sanity:** Ensure `legacy_colormatch = False`. Use `OKLAB` or `RGB` color coherence models to protect skin tones from turning muddy during mid-morph interpolations.
* **The Texture Balance:** Keep high-frequency elements (neon glow, glass shards, flora) calm without wiping out facial structures.

## 4. Mandatory Post-Processing & Finishing Rules
Every script or FFmpeg automation chain provided must follow this two-tier finishing hierarchy:
1. **Temporal/Spatial Stabilization:** Always employ a high-quality 3D denoiser (`hqdn3d`) clamped between `1.0` and `1.5` for spatial processing to filter out shimmer, backed by careful contrast recovery (`contrast=1.02`).
2. **Validation and Mapping:** Every video output MUST generate a corresponding contact sheet (`tile=4x2`, skipping 36 frames per tile) to verify texture balance and structure continuity before deployment.
	* *Validation Command:* `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_read_frames,duration -of default=noprint_wrappers=1`

## 5. C# CUDA Engineering Rules
* **Execution Architecture:** Keep host (CPU) and device (GPU) memory boundaries strictly explicit.
* **Platform Targeting:** Codebase must build exclusively under the `x64` target profile; enforce explicit warnings if compiled under AnyCPU.
* **Extern C Preservation:** CUDA Kernels must use `extern "C"` linkage to avoid C++ name mangling during PTX generation.
