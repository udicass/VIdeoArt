import glob
import json
import os
import time
import urllib.request

JOB_ID = "batch(222891358)-0"
OUTDIR = r"D:\SD_Deforum_Fresh\outputs\img2img-images\WOMANS_DEFORUM_MORPH_V1_30SEC"
EXPECTED = 360


def frame_count():
    if os.path.isdir(OUTDIR):
        return len(glob.glob(os.path.join(OUTDIR, "*.png")))
    return 0


deadline = time.time() + 50 * 60
last = None
last_frames = -1
status = None
while time.time() < deadline:
    frames = frame_count()
    if frames != last_frames:
        print(f"frames={frames}/{EXPECTED}", flush=True)
        last_frames = frames
    if frames >= EXPECTED:
        status = "FRAMES_COMPLETE"
        break
    try:
        with urllib.request.urlopen("http://127.0.0.1:7860/deforum_api/jobs", timeout=10) as r:
            jobs = json.loads(r.read().decode("utf-8"))
        job = jobs.get(JOB_ID, {})
        status = job.get("status")
        err = job.get("error_type")
        prog = job.get("phase_progress")
        line = f"status={status} err={err} prog={prog}"
        if line != last:
            print(line, flush=True)
            last = line
        if status in ("DONE", "ERROR", "INTERRUPTED", "CANCELLED"):
            break
    except Exception as e:
        print("poll error:", e, flush=True)
    time.sleep(20)

print(f"final status={status} frames={frame_count()}/{EXPECTED}", flush=True)
