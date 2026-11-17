#!/usr/bin/env python3
"""Rebuild every furniture GLB from tools/models/factories.js.

    python3 tools/models/build.py            # all variants + manifest.json
    python3 tools/models/build.py tv-42 pc   # only these (manifest unchanged)

Starts save_server.py on 127.0.0.1:8765, opens tools/models/export.html in headless Chrome
(Playwright), and waits until it reports done. Output: assets/models/<name>.glb.
"""
import os
import sys
import threading

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from save_server import serve  # noqa: E402

PORT = 8765


def main():
    server = serve(PORT)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    only = ",".join(sys.argv[1:])
    url = f"http://127.0.0.1:{PORT}/tools/models/export.html" + (f"?only={only}" if only else "")
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(channel="chrome", headless=True)
            except Exception:
                browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.on("console", lambda m: print(m.text) if m.type in ("log", "error", "warning") else None)
            page.goto(url)
            page.wait_for_function("window.__exportResult !== undefined", timeout=180_000)
            result = page.evaluate("window.__exportResult")
            browser.close()
    finally:
        server.shutdown()
    if not result.get("ok"):
        sys.exit(f"export failed: {result.get('error')}")


if __name__ == "__main__":
    main()
