"""Dependency-free mirror Light API. Same contract/table as server.js.

Wish traffic remains on the mirror's existing service. Bind only to loopback.
"""
import json
import logging
import math
import os
import re
import sqlite3
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

DB_PATH = os.environ.get('COORDINATE_DB', '/var/lib/weizichen-coordinates/coordinates.db')
ARCHIVE = os.environ.get('COORDINATE_ARCHIVE', '/var/www/html/data/archive.json')


@contextmanager
def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.execute('PRAGMA busy_timeout=10000')
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript("""
            CREATE TABLE IF NOT EXISTS coordinate_likes (
                coordinate_id TEXT NOT NULL,
                visitor_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                PRIMARY KEY (coordinate_id, visitor_id)
            );
            CREATE INDEX IF NOT EXISTS idx_coordinate_likes_coordinate
                ON coordinate_likes(coordinate_id);
            CREATE INDEX IF NOT EXISTS idx_coordinate_likes_created
                ON coordinate_likes(created_at DESC);
        """)


def distribution(counts):
    values = sorted(v for v in counts if v > 0)
    def at(p):
        return values[math.floor((len(values) - 1) * p)] if values else 0
    return dict(p60=at(.60), p90=at(.90), p99=at(.99), max=values[-1] if values else 0)


def valid_visitor(value):
    return isinstance(value, str) and bool(re.fullmatch(r'[0-9a-fA-F-]{36}', value))


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        query = parse_qs(url.query)
        try:
            if url.path == '/api/coordinates/health':
                with connect() as db:
                    db.execute('SELECT 1').fetchone()
                return self.reply(200, dict(ok=True, service='shining-coordinates-mirror'))
            if url.path == '/api/coordinates/likes':
                visitor = query.get('visitor_id', [''])[0]
                with connect() as db:
                    counts = dict(db.execute('SELECT coordinate_id, COUNT(*) FROM coordinate_likes GROUP BY coordinate_id'))
                    mine = [row[0] for row in db.execute('SELECT coordinate_id FROM coordinate_likes WHERE visitor_id=?', (visitor,))] if valid_visitor(visitor) else []
                return self.reply(200, dict(counts=counts, viewerLikes=mine, distribution=distribution(counts.values())))
            if url.path == '/api/coordinates/ranking':
                try:
                    limit = max(1, min(100, int(query.get('limit', ['50'])[0])))
                except ValueError:
                    limit = 50
                with connect() as db:
                    rows = db.execute('SELECT coordinate_id, COUNT(*) FROM coordinate_likes GROUP BY coordinate_id ORDER BY COUNT(*) DESC, coordinate_id DESC LIMIT ?', (limit,)).fetchall()
                return self.reply(200, dict(ranking=[dict(coordinate_id=r[0], likes=r[1]) for r in rows]))
            self.reply(404, dict(error='not_found'))
        except Exception:
            logging.exception('Light read failed')
            self.reply(503, dict(error='service_unavailable'))

    def mutation(self, liked):
        match = re.fullmatch(r'/api/coordinates/(\d{4})/light', urlsplit(self.path).path)
        if not match:
            return self.reply(404, dict(error='not_found'))
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 4096:
                return self.reply(413, dict(error='invalid_body_size'))
            payload = json.loads(self.rfile.read(size))
            visitor = payload.get('visitor_id') if isinstance(payload, dict) else None
            coordinate = match[1]
            if not valid_visitor(visitor):
                return self.reply(400, dict(error='invalid_light'))
            # Fail closed if the canonical archive is absent or unreadable.
            with open(ARCHIVE, encoding='utf-8') as file:
                ids = {str(r['id']) for r in json.load(file)['records']}
            if coordinate not in ids:
                return self.reply(400, dict(error='invalid_light'))
            with connect() as db:
                if liked:
                    db.execute('INSERT OR IGNORE INTO coordinate_likes(coordinate_id,visitor_id) VALUES (?,?)', (coordinate, visitor))
                else:
                    db.execute('DELETE FROM coordinate_likes WHERE coordinate_id=? AND visitor_id=?', (coordinate, visitor))
                count = db.execute('SELECT COUNT(*) FROM coordinate_likes WHERE coordinate_id=?', (coordinate,)).fetchone()[0]
            self.reply(200, dict(liked=liked, likes=count))
        except (ValueError, json.JSONDecodeError):
            self.reply(400, dict(error='invalid_light'))
        except Exception:
            logging.exception('Light mutation failed')
            self.reply(503, dict(error='service_unavailable'))

    def do_PUT(self):
        self.mutation(True)

    def do_DELETE(self):
        self.mutation(False)


if __name__ == '__main__':
    initialize()
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', '8788'))), Handler).serve_forever()
