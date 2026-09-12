'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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
CREATE INDEX IF NOT EXISTS idx_coordinate_likes_created ON coordinate_likes(created_at DESC);
CREATE TABLE IF NOT EXISTS wishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  city_id TEXT NOT NULL,
  submission_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(submission_key, content)
);
CREATE INDEX IF NOT EXISTS idx_wishes_status_created ON wishes(status, created_at DESC);
CREATE TABLE IF NOT EXISTS wish_likes (
  wish_id INTEGER NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  voter_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (wish_id, voter_key)
);`);

let validIds = new Set();
let validCities = new Set();
function refreshIds() {
  try {
    const data = JSON.parse(fs.readFileSync('/var/www/html/data/archive.json', 'utf8'));
    validIds = new Set(data.records.map(r => String(r.id)));
  } catch (_) {}
  try {
    const cities = JSON.parse(fs.readFileSync('/var/www/html/data/cities.json', 'utf8'));
    validCities = new Set(cities.map(c => String(c.id)));
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
function cleanText(v) { return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''; }
function unsafeWish(v) { return /(https?:\/\/|www\.|微信|vx|qq|电话|手机号|\b1[3-9]\d{9}\b)/i.test(v); }

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

app.get('/api/wishes', (_req, res) => {
  const wishes = db.prepare(`SELECT w.id,w.nickname,w.content,w.city_id,w.created_at,
    COUNT(l.wish_id) AS likes FROM wishes w LEFT JOIN wish_likes l ON l.wish_id=w.id
    WHERE w.status='approved' GROUP BY w.id ORDER BY w.created_at DESC LIMIT 200`).all();
  const cityCounts = db.prepare(`SELECT city_id,COUNT(*) AS count FROM wishes
    WHERE status='approved' GROUP BY city_id`).all();
  res.set('Cache-Control', 'no-store').json({ wishes, cityCounts });
});

app.post('/api/wishes', (req, res) => {
  const nickname = cleanText(req.body && req.body.nickname);
  const content = cleanText(req.body && req.body.content);
  const cityId = cleanText(req.body && req.body.cityId);
  const key = cleanText(req.body && req.body.submissionKey);
  if (req.body && req.body.website) return res.status(400).json({ error: 'invalid_wish' });
  if (nickname.length < 2 || nickname.length > 16 || content.length < 2 || content.length > 100 ||
      !validVisitor(key) || (validCities.size && !validCities.has(cityId))) {
    return res.status(400).json({ error: 'invalid_wish' });
  }
  if (unsafeWish(nickname + ' ' + content)) return res.status(400).json({ error: 'unsafe_wish' });
  const recent = db.prepare(`SELECT COUNT(*) AS n FROM wishes WHERE submission_key=?
    AND created_at > datetime('now','-5 minutes')`).get(key).n;
  if (recent >= 2) return res.status(429).json({ error: 'wish_rate_limited' });
  try {
    const info = db.prepare(`INSERT INTO wishes(nickname,content,city_id,submission_key)
      VALUES(?,?,?,?)`).run(nickname, content, cityId, key);
    res.status(202).json({ ok: true, id: info.lastInsertRowid, status: 'pending' });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'duplicate_wish' });
    throw e;
  }
});

app.patch('/api/wishes', (req, res) => {
  const id = Number(req.body && req.body.id), key = cleanText(req.body && req.body.voterKey);
  if (!Number.isInteger(id) || id < 1 || !validVisitor(key)) return res.status(400).json({ error: 'invalid_light' });
  const exists = db.prepare(`SELECT 1 FROM wishes WHERE id=? AND status='approved'`).get(id);
  if (!exists) return res.status(404).json({ error: 'wish_not_found' });
  const added = db.prepare('INSERT OR IGNORE INTO wish_likes(wish_id,voter_key) VALUES(?,?)').run(id,key).changes > 0;
  const likes = db.prepare('SELECT COUNT(*) AS n FROM wish_likes WHERE wish_id=?').get(id).n;
  res.set('Cache-Control', 'no-store').json({ added, likes });
});

app.listen(Number(process.env.PORT || 3100), '127.0.0.1');
