const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'orders.json');
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '7', 10);
const MAX_FREE_TRANSCRIPTS = parseInt(process.env.MAX_FREE_TRANSCRIPTS || '3', 10);
const RATE_LIMIT_PER_MIN = Math.max(1, parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10));

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

function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ orders: [] }));
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return { orders: [] };
  }
}

function writeStore(store) {
  ensureStore();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let writeQueue = Promise.resolve();
function mutateStore(mutator) {
  const next = writeQueue.then(() => {
    const store = readStore();
    const result = mutator(store);
    writeStore(store);
    return result;
  });
  writeQueue = next.catch(() => {});
  return next;
}

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

function hasAuth(req, order) {
  const token = String((req.headers['x-auth-token'] || '') || '').trim();
  return !!(token && order && order.authCode && token === order.authCode);
}

function findOrder(store, keyText) {
  const key = keyText.toUpperCase();
  return store.orders.find(o => o.id === key || o.shortId === key);
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
      const order = findOrder(readStore(), parts[2]);
      if (!order) return json(res, 404, { error: 'not found' });
      if (!hasAuth(req, order)) return json(res, 403, { error: 'forbidden' });
      return json(res, 200, publicOrder(order));
    }

    if (req.method === 'POST' && parts[1] === 'orders') {
      const body = await readBody(req);
      const email = String(body.email || '').trim();
      if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'invalid email' });

      const created = await mutateStore(store => {
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
        store.orders.unshift(order);
        if (store.orders.length > 500) store.orders.length = 500;
        return order;
      });
      return json(res, 201, created);
    }

    if (req.method === 'PUT' && parts[1] === 'orders' && parts[2] && parts[3] === 'transcript') {
      const body = await readBody(req);
      if (body.text !== undefined && typeof body.text !== 'string') return json(res, 400, { error: 'invalid text' });

      const updated = await mutateStore(store => {
        const order = findOrder(store, parts[2]);
        if (!order) return { error: 'not_found' };
        if (!hasAuth(req, order)) return { error: 'forbidden' };
        order.transcript = String(body.text || '').slice(0, 5 * 1024 * 1024);
        order.chunks = Array.isArray(body.chunks) ? body.chunks.slice(0, 5000) : [];
        order.srt = String(body.srt || '').slice(0, 2 * 1024 * 1024);
        order.transcribedAt = Date.now();
        order.status = 'ready';
        return order;
      });
      if (updated.error === 'not_found') return json(res, 404, { error: 'not found' });
      if (updated.error === 'forbidden') return json(res, 403, { error: 'forbidden' });
      return json(res, 200, publicOrder(updated));
    }

    if (req.method === 'DELETE' && parts[1] === 'orders' && parts[2]) {
      const deleted = await mutateStore(store => {
        const order = findOrder(store, parts[2]);
        if (!order) return { error: 'not_found' };
        if (!hasAuth(req, order)) return { error: 'forbidden' };
        const idx = store.orders.indexOf(order);
        store.orders.splice(idx, 1);
        return order;
      });
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
  console.log('TranscribeAI API listening on port ' + PORT);
  console.log('Trial days: ' + TRIAL_DAYS + ' | Max free transcripts: ' + MAX_FREE_TRANSCRIPTS + ' | Rate limit: ' + RATE_LIMIT_PER_MIN + '/min per IP');
});