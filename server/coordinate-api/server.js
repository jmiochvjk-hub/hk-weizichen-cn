'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));

const dbPath = process.env.COORDINATE_DB || '/var/lib/weizichen-coordinates/coordinates.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS coordinate_likes (
  coordinate_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (coordinate_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_coordinate_likes_coordinate ON coordinate_likes(coordinate_id);
CREATE INDEX IF NOT EXISTS idx_coordinate_likes_created ON coordinate_likes(created_at DESC);`);

let validIds = new Set();
function refreshIds() {
  try {
    const data = JSON.parse(fs.readFileSync('/var/www/html/data/archive.json', 'utf8'));
    validIds = new Set(data.records.map(r => String(r.id)));
  } catch (_) {}
}
refreshIds();

const countsStmt = db.prepare('SELECT coordinate_id, COUNT(*) AS likes FROM coordinate_likes GROUP BY coordinate_id');
const mineStmt = db.prepare('SELECT coordinate_id FROM coordinate_likes WHERE visitor_id = ?');
const insertStmt = db.prepare('INSERT OR IGNORE INTO coordinate_likes (coordinate_id, visitor_id) VALUES (?, ?)');
const deleteStmt = db.prepare('DELETE FROM coordinate_likes WHERE coordinate_id = ? AND visitor_id = ?');
const countStmt = db.prepare('SELECT COUNT(*) AS likes FROM coordinate_likes WHERE coordinate_id = ?');

function distribution(values) {
  const a = values.filter(Boolean).sort((x, y) => x - y);
  const at = p => a.length ? a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))] : 0;
  return { p60: at(.60), p90: at(.90), p99: at(.99), max: a.length ? a[a.length - 1] : 0 };
}
function validVisitor(v) { return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v); }
function validCoordinate(id) { return /^\d{4}$/.test(id) && (!validIds.size || validIds.has(id)); }

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'shining-coordinates-api' }));
app.get('/api/coordinates/likes', (req, res) => {
  const rows = countsStmt.all(), counts = {};
  rows.forEach(r => { counts[r.coordinate_id] = r.likes; });
  const viewer = validVisitor(req.query.visitor_id) ? mineStmt.all(req.query.visitor_id).map(r => r.coordinate_id) : [];
  res.set('Cache-Control', 'no-store').json({ counts, viewerLikes: viewer,
    distribution: distribution(rows.map(r => r.likes)) });
});
app.get('/api/coordinates/ranking', (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const rows = db.prepare(`SELECT coordinate_id, COUNT(*) AS likes FROM coordinate_likes
    GROUP BY coordinate_id ORDER BY likes DESC, coordinate_id DESC LIMIT ?`).all(limit);
  res.set('Cache-Control', 'no-store').json({ ranking: rows });
});
app.put('/api/coordinates/:id/light', (req, res) => {
  const id = req.params.id, visitor = req.body && req.body.visitor_id;
  if (!validCoordinate(id) || !validVisitor(visitor)) return res.status(400).json({ error: 'invalid_light' });
  insertStmt.run(id, visitor);
  res.set('Cache-Control', 'no-store').json({ liked: true, likes: countStmt.get(id).likes });
});
app.delete('/api/coordinates/:id/light', (req, res) => {
  const id = req.params.id, visitor = req.body && req.body.visitor_id;
  if (!validCoordinate(id) || !validVisitor(visitor)) return res.status(400).json({ error: 'invalid_light' });
  deleteStmt.run(id, visitor);
  res.set('Cache-Control', 'no-store').json({ liked: false, likes: countStmt.get(id).likes });
});

app.listen(Number(process.env.PORT || 3100), '127.0.0.1');
