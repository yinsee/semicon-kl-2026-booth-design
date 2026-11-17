#!/usr/bin/env python3
"""Static file server for the repo root + PUT endpoint that writes into assets/models/ only.

Used by tools/models/build.py (export.html PUTs each GLB here). Not needed to view the booths.
    python3 tools/models/save_server.py [port]
"""
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS = (ROOT / "assets" / "models").resolve()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def do_PUT(self):
        target = (ROOT / self.path.lstrip("/").split("?")[0]).resolve()
        if target.parent != MODELS or target.suffix not in (".glb", ".json"):
            self.send_error(403, "writes allowed only to assets/models/*.glb|json")
            return
        length = int(self.headers.get("Content-Length", 0))
        MODELS.mkdir(parents=True, exist_ok=True)
        target.write_bytes(self.rfile.read(length))
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):  # keep the build output short
        if self.command == "PUT":
            super().log_message(fmt, *args)


def serve(port=8765):
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f"serving {ROOT} on http://127.0.0.1:{port} (PUT → {MODELS})")
    serve(port).serve_forever()
