# Merged Video Stage Template

## Two-File 120-Second Premiere Template

Use this specification when the final edit will be assembled manually in Adobe Premiere. It defines two independent movies and does not require a wrapper or automatic merge:

```text
sdX_DEFORUM_FROM_ORIGINAL_120SEC.mp4
sdX_VOICE_OVER_CONTENT_120SEC.mp4
```

### Required Specifications

| Movie | Filename template | Duration | Resolution | Frame rate | Audio |
| --- | --- | ---: | ---: | ---: | --- |
| Deforum from original | `sdX_DEFORUM_FROM_ORIGINAL_120SEC.mp4` | 120 sec | 1080x1080 px | 6 fps | silent |
| Voice-over content | `sdX_VOICE_OVER_CONTENT_120SEC.mp4` | 120 sec | 1080x1080 px | 6 fps | silent |

Replace `X` with the movie number. For example, Movie 4 uses:

```text
sd4_DEFORUM_FROM_ORIGINAL_120SEC.mp4
sd4_VOICE_OVER_CONTENT_120SEC.mp4
```

### Voice-Over Content Rule

The voice-over movie must contain enough SDX voice-over beats to cover the full 120 seconds. Use 8-16 visual beats as the minimum storyboard, then interpolate and hold the final frame as needed until the output is exactly 120 seconds. Do not merge the two files in the pipeline; place them as separate layers or tracks in Adobe Premiere.

### Premiere Handoff

```text
outputs/deforum-merged-previews/sdX_DEFORUM_FROM_ORIGINAL_120SEC.mp4
outputs/deforum-merged-previews/sdX_VOICE_OVER_CONTENT_120SEC.mp4
```

Both files must be checked with `ffprobe` before importing: width `1080`, height `1080`, frame rate `6/1`, and duration `120.000000`.

Use this template when you want to make a new merged preview for another movie, for example Movie 2.

The current merged-video method is:

1. collect voice-over beats
2. generate fresh voice-over content frames from those beats
3. stretch/interpolate those frames into a 90-second left/content movie
4. optionally blend that left/content movie with a right/source movie
5. save the merged MP4 in `outputs/deforum-merged-previews`
6. point the app preview to that MP4

## Movie 2 Values

Change only these values when applying the template to another movie.

```text
MOVIE_NUMBER=2
MOVIE_FILE=Synthetic_Desires_2.mp4
MOVIE_LABEL=Movie 2
OUTPUT_PREFIX=sd2_VOICEOVER_FRESH_CONTENT
BEATS_JSON=outputs/deforum-merged-previews/sd2_voiceover_beats_current.json
PREVIEW_ROOT=outputs/deforum-merged-previews
FORGE_DATE_ROOT=D:\SD_Deforum_Fresh\outputs\img2img-images\2026-07-18
FINAL_MP4=outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_90SEC_RIGHT_STRONG.mp4
```

## Stage 1: Make The Beats JSON

Create `outputs/deforum-merged-previews/sd2_voiceover_beats_current.json` with the main voice-over story beats for Movie 2.

Template shape:

```json
{
  "movie": "Synthetic_Desires_2.mp4",
  "label": "Movie 2",
  "beats": [
    "Beat 1: describe the opening image and emotional weather.",
    "Beat 2: describe the central figure, desire, damage, or secret.",
    "Beat 3: describe the room, street, body language, light, glass, rain, silence.",
    "Beat 4: describe memory, ritual, pressure, or hidden motive.",
    "Beat 5: describe the visual turn that should change the generated imagery.",
    "Beat 6: describe the final unresolved feeling."
  ]
}
```

For better results, use 8-16 beats. Keep each beat visual and specific. Avoid text, logos, subtitles, and UI words inside the beat text.

## Stage 2: Generate Fresh Voice-Over Frames

Run this from the workspace root:

```powershell
node scripts/generateVoiceoverFreshFrames.mjs `
  --beats outputs/deforum-merged-previews/sd2_voiceover_beats_current.json `
  --movie-label "Movie 2" `
  --output-prefix sd2_VOICEOVER_FRESH_CONTENT `
  --frames 39 `
  --fps 6 `
  --duration 90 `
  --forge-root "D:\SD_Deforum_Fresh\outputs\img2img-images\2026-07-18"
```

Outputs created:

```text
D:\SD_Deforum_Fresh\outputs\img2img-images\2026-07-18\sd2_VOICEOVER_FRESH_CONTENT_frames\
D:\SD_Deforum_Fresh\outputs\img2img-images\2026-07-18\sd2_VOICEOVER_FRESH_CONTENT_90sec_visible_frames\
D:\SD_Deforum_Fresh\outputs\img2img-images\2026-07-18\sd2_VOICEOVER_FRESH_CONTENT_FINAL_90sec_frames\
outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_KEYFRAMES.mp4
outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_LEFT_90SEC.mp4
outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_90SEC_RIGHT_STRONG.mp4
```

If you stop here, the final MP4 is the generated voice-over content movie only.

## Stage 3: Choose Or Build The Right Source

The optional right/source movie should be a 90-second MP4 that carries the real Movie 2 motion or Deforum motion you want merged with the voice-over content.

Suggested placeholder path:

```text
outputs/deforum-merged-previews/sd2_RIGHT_SOURCE_90SEC.mp4
```

Requirements:

```text
format: mp4
duration: about 90 seconds
shape: works best as square or scalable to 512x512
content: Movie 2 real frames, Movie 2 Deforum frames, or another Movie 2 motion pass
```

## Stage 4: Merge Fresh Content With Right Source

When the right/source movie exists, rerun the generator with blending enabled:

```powershell
node scripts/generateVoiceoverFreshFrames.mjs `
  --beats outputs/deforum-merged-previews/sd2_voiceover_beats_current.json `
  --movie-label "Movie 2" `
  --output-prefix sd2_VOICEOVER_FRESH_CONTENT `
  --frames 39 `
  --fps 6 `
  --duration 90 `
  --forge-root "D:\SD_Deforum_Fresh\outputs\img2img-images\2026-07-18" `
  --blend-right true `
  --right-source outputs/deforum-merged-previews/sd2_RIGHT_SOURCE_90SEC.mp4
```

The blend used by the script is:

```text
left voice-over content: 25%
right source movie: 75%
```

Final output:

```text
outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_90SEC_RIGHT_STRONG.mp4
```

## Stage 5: Verify The Result

Check duration, size, and frame count:

```powershell
ffprobe -v error `
  -select_streams v:0 `
  -show_entries stream=width,height,nb_frames,r_frame_rate `
  -show_entries format=duration `
  -of json `
  outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_90SEC_RIGHT_STRONG.mp4
```

Create a proof tile:

```powershell
ffmpeg -y `
  -i outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_90SEC_RIGHT_STRONG.mp4 `
  -vf "select='not(mod(n,30))',scale=256:256,tile=5x4" `
  -frames:v 1 `
  outputs/deforum-merged-previews/sd2_VOICEOVER_FRESH_CONTENT_proof_tile.jpg
```

## Stage 6: Preview In The App

The dev server can stream files from `outputs/deforum-merged-previews` through:

```text
/api/dev/merged-preview-result?file=<file-name>.mp4
```

For Movie 2:

```text
/api/dev/merged-preview-result?file=sd2_VOICEOVER_FRESH_CONTENT_90SEC_RIGHT_STRONG.mp4
```

To wire Movie 2 into the Voice Over preview, use this file name in `src/main.js` the same way Movie 3 uses its merged preview file.

## Quick Checklist

```text
[ ] Movie 2 beats JSON exists
[ ] Forge API is running at http://127.0.0.1:7860
[ ] Fresh frames generated
[ ] LEFT_90SEC movie created
[ ] Optional right/source 90s movie exists
[ ] Final merged MP4 created
[ ] ffprobe duration is about 90 seconds
[ ] proof tile looks correct
[ ] app preview points to the final MP4
```