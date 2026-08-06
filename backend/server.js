const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'orders.db');
const LEGACY_FILE = path.join(DATA_DIR, 'orders.json');
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '7', 10);
const MAX_FREE_TRANSCRIPTS = parseInt(process.env.MAX_FREE_TRANSCRIPTS || '3', 10);
const RATE_LIMIT_PER_MIN = Math.max(1, parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10));
const MAX_ORDERS = Math.max(1, parseInt(process.env.MAX_ORDERS || '50000', 10));

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAX_BODY = 5 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
  'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining'
};

// ---------- SQLite storage ----------

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,
    short_id       TEXT NOT NULL,
    auth_code      TEXT NOT NULL,
    created_at     INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'received',
    email          TEXT NOT NULL DEFAULT '',
    file_name      TEXT NOT NULL DEFAULT '',
    duration_sec   REAL,
    duration_label TEXT NOT NULL DEFAULT '',
    format         TEXT NOT NULL DEFAULT 'txt',
    lang           TEXT NOT NULL DEFAULT 'en',
    turnaround     INTEGER NOT NULL DEFAULT 72,
    price          TEXT NOT NULL DEFAULT '$0.00',
    transcript     TEXT NOT NULL DEFAULT '',
    srt            TEXT NOT NULL DEFAULT '',
    chunks         TEXT NOT NULL DEFAULT '[]',
    transcribed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
  CREATE INDEX IF NOT EXISTS idx_orders_short ON orders(short_id);
`);

const rowToOrder = row => {
  if (!row) return null;
  let chunks = [];
  try { chunks = JSON.parse(row.chunks || '[]'); } catch (e) { chunks = []; }
  return {
    id: row.id,
    shortId: row.short_id,
    authCode: row.auth_code,
    createdAt: row.created_at,
    status: row.status,
    email: row.email,
    fileName: row.file_name,
    durationSec: row.duration_sec,
    durationLabel: row.duration_label,
    format: row.format,
    lang: row.lang,
    turnaround: row.turnaround,
    price: row.price,
    transcript: row.transcript,
    srt: row.srt,
    chunks: chunks,
    transcribedAt: row.transcribed_at || undefined
  };
};

function migrateFromLegacy() {
  if (!fs.existsSync(LEGACY_FILE)) return;
  const count = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  if (count > 0) return;
  let store;
  try { store = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8')); } catch (e) { store = { orders: [] }; }
  const rows = Array.isArray(store.orders) ? store.orders : [];
  const ins = db.prepare(`INSERT OR IGNORE INTO orders
    (id, short_id, auth_code, created_at, status, email, file_name, duration_sec,
     duration_label, format, lang, turnaround, price, transcript, srt, chunks, transcribed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const o of rows) {
    try {
      ins.run(
        String(o.id || ''), String(o.shortId || (o.id ? String(o.id).split('-').pop() : '')),
        String(o.authCode || ''), Number(o.createdAt) || Date.now(), String(o.status || 'received'),
        String(o.email || ''), String(o.fileName || ''), Number.isFinite(o.durationSec) ? o.durationSec : null,
        String(o.durationLabel || ''), String(o.format || 'txt'), String(o.lang || 'en'),
        Math.min(Number(o.turnaround) || 72, 1000), String(o.price || '$0.00'),
        String(o.transcript || ''), String(o.srt || ''), JSON.stringify(Array.isArray(o.chunks) ? o.chunks : []),
        o.transcribedAt || null
      );
    } catch (e) { /* skip invalid row */ }
  }
  fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.migrated');
  console.log('Migrated ' + rows.length + ' orders from legacy JSON to SQLite');
}
migrateFromLegacy();

function findOrder(keyText) {
  const key = String(keyText).toUpperCase();
  const row = db.prepare('SELECT * FROM orders WHERE id = ? OR short_id = ?').get(key, key);
  return rowToOrder(row);
}

function orderCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
}

function trimOldest() {
  const over = orderCount() - MAX_ORDERS;
  if (over <= 0) return;
  db.prepare('DELETE FROM orders WHERE id IN (SELECT id FROM orders ORDER BY created_at ASC LIMIT ?)').run(over);
}

function insertOrder(order) {
  db.prepare(`INSERT INTO orders
    (id, short_id, auth_code, created_at, status, email, file_name, duration_sec,
     duration_label, format, lang, turnaround, price, transcript, srt, chunks, transcribed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '[]', NULL)`).run(
    order.id, order.shortId, order.authCode, order.createdAt, order.status, order.email,
    order.fileName, Number.isFinite(order.durationSec) ? order.durationSec : null,
    order.durationLabel, order.format, order.lang, order.turnaround, order.price
  );
  trimOldest();
  return order;
}

function hasAuth(req, order) {
  const token = String((req.headers['x-auth-token'] || '') || '').trim();
  return !!(token && order && order.authCode && token === order.authCode);
}

function setTranscript(req, keyText, body) {
  const order = findOrder(keyText);
  if (!order) return { error: 'not_found' };
  if (!hasAuth(req, order)) return { error: 'forbidden' };
  const transcript = String(body.text || '').slice(0, 5 * 1024 * 1024);
  const srt = String(body.srt || '').slice(0, 2 * 1024 * 1024);
  const chunks = Array.isArray(body.chunks) ? body.chunks.slice(0, 5000) : [];
  db.prepare(`UPDATE orders SET transcript = ?, srt = ?, chunks = ?, transcribed_at = ?, status = 'ready' WHERE id = ?`)
    .run(transcript, srt, JSON.stringify(chunks), Date.now(), order.id);
  return findOrder(keyText);
}

function deleteOrder(req, keyText) {
  const order = findOrder(keyText);
  if (!order) return { error: 'not_found' };
  if (!hasAuth(req, order)) return { error: 'forbidden' };
  db.prepare('DELETE FROM orders WHERE id = ?').run(order.id);
  return { ok: true };
}

// ---------- rate limiting ----------

const rateBuckets = new Map(); // ip -> { count, resetAt }

function rateLimitCheck(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + 60000 };
    rateBuckets.set(ip, bucket);
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_PER_MIN;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function generateId() {
  return 'TRN-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateAuthCode() {
  return crypto.randomBytes(24).toString('hex');
}

function json(res, status, data, extra) {
  const body = JSON.stringify(data);
  const headers = {};
  Object.assign(headers, SECURITY_HEADERS, extra || {});
  headers['Content-Type'] = 'application/json; charset=utf-8';
  headers['Content-Length'] = String(Buffer.byteLength(body));
  res.writeHead(status, headers);
  res.end(body);
}

function publicOrder(order) {
  const { authCode, ...pub } = order;
  return pub;
}

function calcRemaining(req) {
  const ip = clientIp(req);
  const bucket = rateBuckets.get(ip);
  if (!bucket) return RATE_LIMIT_PER_MIN;
  return Math.max(0, RATE_LIMIT_PER_MIN - bucket.count);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      if (data.length + chunk.length > MAX_BODY) {
        tooBig = true;
        data = '';
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      if (tooBig) { reject(new Error('payload too large')); return; }
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', e => { if (!settled) { settled = true; reject(e); } });
  });
}

const TRIAL_INFO = {
  trialDays: TRIAL_DAYS,
  maxFreeTranscripts: MAX_FREE_TRANSCRIPTS
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, SECURITY_HEADERS);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] !== 'api') {
    return json(res, 404, { error: 'not found' });
  }

  const rateOk = rateLimitCheck(req);
  const remaining = calcRemaining(req);
  if (!rateOk) {
    return json(res, 429, { error: 'too many requests' }, {
      'Retry-After': '60',
      'X-RateLimit-Limit': String(RATE_LIMIT_PER_MIN),
      'X-RateLimit-Remaining': '0'
    });
  }

  try {
    if (req.method === 'GET' && parts[1] === 'trial') {
      return json(res, 200, TRIAL_INFO, {
        'X-RateLimit-Limit': String(RATE_LIMIT_PER_MIN),
        'X-RateLimit-Remaining': String(remaining)
      });
    }

    if (req.method === 'GET' && parts[1] === 'orders' && parts[2] && !parts[3]) {
      const order = findOrder(parts[2]);
      if (!order) return json(res, 404, { error: 'not found' });
      if (!hasAuth(req, order)) return json(res, 403, { error: 'forbidden' });
      return json(res, 200, publicOrder(order));
    }

    if (req.method === 'POST' && parts[1] === 'orders') {
      const body = await readBody(req);
      const email = String(body.email || '').trim();
      if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'invalid email' });

      const id = generateId();
      const order = {
        id,
        shortId: id.split('-').pop(),
        authCode: generateAuthCode(),
        createdAt: Date.now(),
        status: 'received',
        email: email || '',
        fileName: String(body.fileName || '').slice(0, 255),
        durationSec: Number.isFinite(body.durationSec) ? body.durationSec : null,
        durationLabel: String(body.durationLabel || (body.durationSec ? body.durationSec : '')).slice(0, 100),
        format: String(body.format || 'txt').slice(0, 10),
        lang: String(body.lang || 'en').slice(0, 10),
        turnaround: Math.min(Number(body.turnaround) || 72, 1000),
        price: String(body.price || '$0.00').slice(0, 20),
        transcript: '',
        srt: '',
        chunks: []
      };
      insertOrder(order);
      return json(res, 201, order);
    }

    if (req.method === 'PUT' && parts[1] === 'orders' && parts[2] && parts[3] === 'transcript') {
      const body = await readBody(req);
      if (body.text !== undefined && typeof body.text !== 'string') return json(res, 400, { error: 'invalid text' });
      const updated = setTranscript(req, parts[2], body);
      if (updated.error === 'not_found') return json(res, 404, { error: 'not found' });
      if (updated.error === 'forbidden') return json(res, 403, { error: 'forbidden' });
      return json(res, 200, publicOrder(updated));
    }

    if (req.method === 'DELETE' && parts[1] === 'orders' && parts[2]) {
      const deleted = deleteOrder(req, parts[2]);
      if (deleted.error === 'not_found') return json(res, 404, { error: 'not found' });
      if (deleted.error === 'forbidden') return json(res, 403, { error: 'forbidden' });
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    if (e.message === 'payload too large' || e.message === 'invalid JSON') {
      return json(res, 400, { error: e.message });
    }
    return json(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log('TranscribeAI API (SQLite) listening on port ' + PORT);
  console.log('Trial days: ' + TRIAL_DAYS + ' | Max free transcripts: ' + MAX_FREE_TRANSCRIPTS + ' | Rate limit: ' + RATE_LIMIT_PER_MIN + '/min per IP');
});