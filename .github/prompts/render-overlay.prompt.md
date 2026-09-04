---
name: "Render Overlay"
description: "Prepare a validated VOC and Deforum overlay render configuration before starting an expensive GPU render."
argument-hint: "Provide story source, interpretations, duration, resolution, overlay ratio, and output prefix"
agent: "agent"
---

# Render Overlay Configuration

Prepare and confirm a render configuration using these parameters:

- **Story Source:** ${input:storySource:Source text, script, or storyboard path}
- **VOC Interpretation:** ${input:vocInterpretation:Voice-over visual constraints}
- **Deforum Interpretation:** ${input:deforumInterpretation:Deforum style and motion constraints}
- **Subject Count:** ${input:subjectCount:1}
- **Duration:** ${input:duration:30 seconds}
- **Resolution:** ${input:resolution:1080x1080}
- **Overlay Ratio:** ${input:overlayRatio:50/50}
- **Output Prefix:** ${input:outputPrefix:render-name}

Before rendering:

1. Enforce the requested subject count. For `1`, reject prompts that introduce groups, duplicates, or secondary figures.
2. Confirm VOC and Deforum are visually distinct but share framing, timing, and geometry.
3. Confirm Forge uses CUDA on `cuda:0` and the generation process can resume after interruption.
4. Preserve existing media and use new output filenames.
5. State the planned metadata and contact-sheet checks, then wait for confirmation before starting an expensive render.
