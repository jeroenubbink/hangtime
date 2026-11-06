#!/usr/bin/env python3
"""Serve the games for local play (and from a phone on the same network), and take in Rushtime replays.

    python3 serve.py [port]        (default 8765)

Everything in this folder is served as it is. A POST to /replays saves its body (a replay, JSON) to
replays/<date>-<time>-<level>.json; GET /replays/ping says the server takes them, so the game shows its
Send replay button. GET /replays/index lists them for dev mode's run library: each run's level, car, score and
medal, and your car's way to the crash (for the medal lines). A POST to /snaps saves a dev mode snapshot (what
was on the screen, and the game's state then) to replays/snaps/<date>-<time>-<level>.jpg and .json.
"""
import base64
import json
import os
import re
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
REPLAYS = os.path.join(ROOT, 'replays')
MAX = 64 * 1024 * 1024
# (each replay's summary, by file name, kept till the file changes)
SUMMARIES = {}


def summary(name):
    path = os.path.join(REPLAYS, name)
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        # (gone since the folder was listed)
        return None
    if name in SUMMARIES and SUMMARIES[name][0] == mtime:
        return SUMMARIES[name][1]
    try:
        with open(path) as f:
            R = json.load(f)
        end = next((e for e in R.get('events', []) if e.get('type') == 'end'), None)
        # Your car every fifth of a second, [x, z, y], up to the crash
        path_ = []
        for i, F in enumerate(R.get('frames', [])):
            you = next((b for b in F['b'] if b[0] == 'you'), None)
            if you and i % 4 == 0:
                path_.append([you[1], you[3], you[2]])
            if F.get('s') == 'crash':
                if you:
                    path_.append([you[1], you[3], you[2]])
                break
        S = {'name': name, 'level': R.get('level'), 'car': R.get('car'), 'time': R.get('time'), 'date': R.get('date'),
             'score': end and end.get('total'), 'medal': end and end.get('medal'), 'path': path_}
    except (OSError, ValueError, KeyError, TypeError, IndexError, AttributeError):
        S = None
    SUMMARIES[name] = (mtime, S)
    return S


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
        if self.path == '/replays/index':
            names = sorted(n for n in os.listdir(REPLAYS) if n.endswith('.json')) if os.path.isdir(REPLAYS) else []
            return self.reply(200, [S for S in map(summary, names) if S and S['score'] is not None])
        super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] not in ('/replays', '/snaps'):
            return self.reply(404, {'error': 'not here'})
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n <= MAX:
            return self.reply(413, {'error': 'too big'})
        body = self.rfile.read(n)
        if self.path.split('?')[0] == '/snaps':
            return self.snap(body)
        try:
            level = re.sub(r'[^a-z0-9]', '', str(json.loads(body).get('level', 'run')).lower())[:20] or 'run'
        except (ValueError, AttributeError):
            return self.reply(400, {'error': 'not a replay'})
        os.makedirs(REPLAYS, exist_ok=True)
        name = time.strftime('%Y%m%d-%H%M%S') + '-' + level + '.json'
        with open(os.path.join(REPLAYS, name), 'wb') as f:
            f.write(body)
        self.reply(200, {'name': name})

    # A snapshot: { image: a data: URL (JPEG), meta: {...} }
    def snap(self, body):
        try:
            S = json.loads(body)
            image = base64.b64decode(S['image'].split(',', 1)[1])
            meta = S.get('meta') or {}
            level = re.sub(r'[^a-z0-9]', '', str(meta.get('level', 'snap')).lower())[:20] or 'snap'
        except (ValueError, KeyError, TypeError, AttributeError, IndexError):
            return self.reply(400, {'error': 'not a snapshot'})
        folder = os.path.join(REPLAYS, 'snaps')
        os.makedirs(folder, exist_ok=True)
        name = time.strftime('%Y%m%d-%H%M%S') + '-' + level
        with open(os.path.join(folder, name + '.jpg'), 'wb') as f:
            f.write(image)
        with open(os.path.join(folder, name + '.json'), 'w') as f:
            json.dump(meta, f, indent=1)
        self.reply(200, {'name': name})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'Serving {ROOT} on http://0.0.0.0:{port}/ (replays go to {REPLAYS})')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
