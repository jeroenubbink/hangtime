#!/usr/bin/env python3
"""Serve the games for local play (and from a phone on the same network), and take in Rushtime replays.

    python3 serve.py [port]        (default 8765)

Everything in this folder is served as it is. A POST to /replays saves its body (a replay, JSON) to
replays/<date>-<time>-<level>.json; GET /replays/ping says the server takes them, so the game shows its
Send replay button.
"""
import json
import os
import re
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
REPLAYS = os.path.join(ROOT, 'replays')
MAX = 64 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # (always the latest code when you reload)
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/replays/ping':
            return self.reply(200, {'ok': True})
        super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/replays':
            return self.reply(404, {'error': 'not here'})
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n <= MAX:
            return self.reply(413, {'error': 'too big'})
        body = self.rfile.read(n)
        try:
            level = re.sub(r'[^a-z0-9]', '', str(json.loads(body).get('level', 'run')).lower())[:20] or 'run'
        except (ValueError, AttributeError):
            return self.reply(400, {'error': 'not a replay'})
        os.makedirs(REPLAYS, exist_ok=True)
        name = time.strftime('%Y%m%d-%H%M%S') + '-' + level + '.json'
        with open(os.path.join(REPLAYS, name), 'wb') as f:
            f.write(body)
        self.reply(200, {'name': name})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'Serving {ROOT} on http://0.0.0.0:{port}/ (replays go to {REPLAYS})')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
