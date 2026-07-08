import os
"""Record a complete VIDEOART Full Run via OBS.

This script opens the local app at http://localhost:5173/ in a visible
Chromium window, starts OBS recording through the OBS WebSocket API, waits
for you to trigger Full Run manually in the browser, waits for the run to
finish, stops the OBS recording, and copies the resulting video into
VIDEOART/outputs/.

Save this file at:
        VIDEOART/scripts/record_full_run.py

Recommended terminal workflow:

Terminal 1:
        npm run dev

Terminal 2:
        cd scripts
        pip install playwright obsws-python
        playwright install chromium
        python record_full_run.py --obs-password YOUR_OBS_PASSWORD

OBS requirements:
1. Open Tools -> WebSocket Server Settings and enable the server.
2. Note the password and port. The default port is 4455.
3. Prepare a scene with a Window Capture or Display Capture source that sees
     the browser window opened by this script.

Non-interactive launch option for PowerShell:
    $env:OBS_WEBSOCKET_PASSWORD = 'your password here'
    python record_full_run.py

If the runtime is known ahead of time, pass --run-seconds to bypass automatic
completion detection.
"""

import argparse
import getpass
import shutil
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
import obsws_python as obs
from websocket import WebSocketException


# ---- Settings you may need to adjust ----
URL = "http://localhost:5173/"        # Local Vite dev server (npm run dev)
FULL_RUN_BUTTON_SELECTOR = "#btn-full-run"
FULL_RUN_BUTTON_TEXT = "Full Run"
VIEWPORT = {"width": 1920, "height": 1080}
POST_CLICK_BUFFER_SEC = 3             # Seconds of "quiet" padding at start/end of recording
TOTAL_RUN_SECONDS = None              # If None -> tries auto-detection
                                       # If set (e.g. 480 = 8 min) -> fixed wait instead
MAX_WAIT_SECONDS = 60 * 20            # Safety cap — never wait more than 20 min

# Project paths (script lives in VIDEOART/scripts/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUTS_DIR = PROJECT_ROOT / "outputs"


def connect_obs(host: str, port: int, password: str) -> obs.ReqClient:
    try:
        client = obs.ReqClient(host=host, port=port, password=password, timeout=5)
    except (ConnectionRefusedError, OSError, WebSocketException) as exc:
        raise SystemExit(
            f"[OBS][Error] Could not connect to ws://{host}:{port}. "
            "Make sure OBS is running, WebSocket is enabled under Tools -> WebSocket Server Settings, "
            "and the host/port match your OBS server."
        ) from exc
    print("[OBS] Connected successfully.")
    return client


def resolve_obs_password(cli_password: str | None) -> str:
    if cli_password:
        return cli_password

    env_password = os.environ.get("OBS_WEBSOCKET_PASSWORD")
    if env_password:
        return env_password

    return getpass.getpass("OBS WebSocket password: ")


def start_recording(client: obs.ReqClient):
    client.start_record()
    print("[OBS] Recording started.")


def stop_recording(client: obs.ReqClient):
    resp = client.stop_record()
    output_path = getattr(resp, "output_path", None)
    if output_path:
        print(f"[OBS] Recording stopped. File: {output_path}")
    else:
        print("[OBS] Recording stopped. Check your OBS Recording Path folder.")
    return output_path


def copy_to_outputs(output_path):
    if not output_path:
        print("[Copy] No output path reported by OBS — skipping auto-copy. "
              f"Please copy the file manually into {OUTPUTS_DIR}")
        return
    src = Path(output_path)
    if not src.exists():
        print(f"[Copy][Warning] File not found at {src} — skipping auto-copy.")
        return
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUTPUTS_DIR / src.name
    if dest.exists() and dest.resolve() == src.resolve():
        print(f"[Copy] OBS already wrote the recording to: {dest}")
        return
    shutil.copy2(src, dest)
    print(f"[Copy] Copied recording to: {dest}")


def get_full_run_button(page):
    button = page.locator(FULL_RUN_BUTTON_SELECTOR)
    if button.count():
        return button.first
    return page.get_by_text(FULL_RUN_BUTTON_TEXT, exact=False).first


def wait_for_full_run_to_start(page):
    print(f'[Browser] Waiting for you to start Full Run using "{FULL_RUN_BUTTON_SELECTOR}"...')
    button = get_full_run_button(page)
    button.wait_for(state="visible", timeout=15000)
    page.wait_for_function(
        """(el) => {
            if (!el) return false;
            return el.classList.contains('running') ||
                el.classList.contains('paused') ||
                /Pause|Resume|Podcast|Exam/i.test((el.textContent || '').trim());
        }""",
        arg=button.element_handle(),
        timeout=MAX_WAIT_SECONDS * 1000,
    )
    print("[Browser] Detected Full Run start.")


def wait_for_run_to_finish(page):
    """Wait for the Full Run button to return to its idle state."""
    if TOTAL_RUN_SECONDS:
        print(f"[Wait] Waiting {TOTAL_RUN_SECONDS} seconds (fixed-duration mode)...")
        time.sleep(TOTAL_RUN_SECONDS)
        return

    print("[Wait] Waiting for automatic detection of run completion...")
    start = time.time()
    try:
        button = get_full_run_button(page)
        page.wait_for_function(
            """(el) => {
                if (!el) return false;
                const text = (el.textContent || '').trim();
                return !el.classList.contains('running') &&
                    !el.classList.contains('paused') &&
                    /Full Run/i.test(text);
            }""",
            arg=button.element_handle(),
            timeout=MAX_WAIT_SECONDS * 1000,
        )
        print(f"[Wait] Detected run completion after {int(time.time()-start)} seconds.")
    except Exception as e:
        print(f"[Wait][Warning] Could not auto-detect completion ({e}).")
        print(f"[Wait] Falling back to a fixed wait of {MAX_WAIT_SECONDS} seconds.")
        time.sleep(MAX_WAIT_SECONDS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--obs-host", default="localhost")
    parser.add_argument("--obs-port", type=int, default=4455)
    parser.add_argument("--obs-password")
    parser.add_argument("--run-seconds", type=int, default=None,
                         help="If the run duration is known in seconds, "
                              "skip auto-detection and just wait this long")
    args = parser.parse_args()

    global TOTAL_RUN_SECONDS
    if args.run_seconds:
        TOTAL_RUN_SECONDS = args.run_seconds

    obs_password = resolve_obs_password(args.obs_password)
    obs_client = connect_obs(args.obs_host, args.obs_port, obs_password)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # not headless — OBS needs a real window to capture
        context = browser.new_context(viewport=VIEWPORT)
        page = context.new_page()

        print(f"[Browser] Opening {URL}")
        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=15000)
        except Exception:
            print("[Browser][Error] Could not connect. Make sure 'npm run dev' "
                  "is running in a separate terminal and the app is reachable "
                  "at the URL above.")
            raise
        time.sleep(2)  # let animation/WebGL settle

        start_recording(obs_client)
        time.sleep(POST_CLICK_BUFFER_SEC)  # a few quiet seconds at the start

        wait_for_full_run_to_start(page)
        wait_for_run_to_finish(page)

        time.sleep(POST_CLICK_BUFFER_SEC)  # a few quiet seconds at the end
        output_path = stop_recording(obs_client)

        browser.close()

    copy_to_outputs(output_path)
    print(f"\n✅ Done. Check {OUTPUTS_DIR} for your recording.")


if __name__ == "__main__":
    sys.exit(main())


