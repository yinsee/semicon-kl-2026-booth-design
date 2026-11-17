#!/usr/bin/env python3
"""Render tools/screens/dashboard.html to assets/screens/dashboard.mp4 (seamless loop, no audio).

    python3 tools/screens/render_dashboard.py [fps] [seconds]

Draws each frame with window.drawAt(t) in headless Chrome (Playwright), saves PNGs to a temp
folder and encodes them with ffmpeg (H.264, 960x540, yuv420p, +faststart).
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PAGE = ROOT / "tools" / "screens" / "dashboard.html"
OUT = ROOT / "assets" / "screens" / "dashboard.mp4"


def main():
    fps = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 10.0
    frames = int(round(fps * seconds))
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="dash-"))
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(channel="chrome", headless=True)
            except Exception:
                browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            page.goto(PAGE.as_uri() + "?render")
            canvas = page.locator("#c")
            for i in range(frames):
                page.evaluate(f"window.drawAt({i / fps})")
                canvas.screenshot(path=str(tmp / f"f{i:04d}.png"))
            browser.close()
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-framerate", str(fps), "-i", str(tmp / "f%04d.png"),
            "-vf", "scale=960:540:flags=lanczos", "-c:v", "libx264", "-preset", "veryslow", "-crf", "28",
            "-g", str(frames), "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", str(OUT),
        ], check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"{OUT} {OUT.stat().st_size} bytes, {frames} frames @ {fps} fps")


if __name__ == "__main__":
    main()
