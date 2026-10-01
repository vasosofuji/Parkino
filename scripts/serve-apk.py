"""Serve exactly one APK for phone download. No API, filesystem browsing or uploads."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import shutil
APK = Path(__file__).resolve().parents[1] / "preview" / "ParkSkopje-preview.apk"
class DownloadHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/":
            body = b'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>ParkSkopje APK</title></head><body style="font:18px system-ui;padding:32px;color:#153d3a"><h1>ParkSkopje</h1><p>Android test build. Parking coverage and prices are incomplete.</p><p><a href="/ParkSkopje-preview.apk">Download ParkSkopje APK</a></p><p>The link is available while this PC and download server are running.</p></body></html>'
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
        elif path == "/ParkSkopje-preview.apk" and APK.is_file():
            self.send_response(200); self.send_header("Content-Type", "application/vnd.android.package-archive"); self.send_header("Content-Disposition", 'attachment; filename="ParkSkopje-preview.apk"'); self.send_header("Content-Length", str(APK.stat().st_size)); self.end_headers()
            with APK.open("rb") as stream: shutil.copyfileobj(stream, self.wfile)
        else:
            self.send_error(404)
if __name__ == "__main__":
    print("APK-only download server listening on http://127.0.0.1:8766", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8766), DownloadHandler).serve_forever()
