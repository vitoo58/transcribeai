const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'orders.json');
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '7', 10);
const MAX_FREE_TRANSCRIPTS = parseInt(process.env.MAX_FREE_TRANSCRIPTS || '3', 10);

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

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

function generateId() {
  return 'TRN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 5e6) { reject(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}

const TRIAL_INFO = {
  trialDays: TRIAL_DAYS,
  maxFreeTranscripts: MAX_FREE_TRANSCRIPTS
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'trial') {
      return json(res, 200, TRIAL_INFO);
    }

    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'orders' && parts[2]) {
      const store = readStore();
      const order = store.orders.find(o => o.id === parts[2].toUpperCase());
      if (!order) return json(res, 404, { error: 'not found' });
      return json(res, 200, order);
    }

    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'orders') {
      const body = await readBody(req);
      const store = readStore();
      const id = generateId();
      const order = {
        id: id,
        shortId: id.split('-').pop(),
        createdAt: Date.now(),
        status: 'received',
        email: body.email || '',
        fileName: body.fileName || '',
        durationSec: body.durationSec || null,
        durationLabel: body.durationLabel || null,
        format: body.format || 'txt',
        lang: body.lang || 'en',
        turnaround: body.turnaround || 72,
        price: body.price || '$0.00',
        transcript: '',
        srt: '',
        chunks: []
      };
      store.orders.unshift(order);
      if (store.orders.length > 500) store.orders.length = 500;
      writeStore(store);
      return json(res, 201, order);
    }

    if (req.method === 'PUT' && parts[0] === 'api' && parts[1] === 'orders' && parts[2] && parts[3] === 'transcript') {
      const body = await readBody(req);
      const store = readStore();
      const order = store.orders.find(o => o.id === parts[2].toUpperCase());
      if (!order) return json(res, 404, { error: 'not found' });
      order.transcript = body.text || body.transcript || '';
      order.chunks = body.chunks || [];
      order.srt = body.srt || '';
      order.transcribedAt = Date.now();
      order.status = 'ready';
      writeStore(store);
      return json(res, 200, order);
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log('TranscribeAI API listening on port ' + PORT);
  console.log('Trial days: ' + TRIAL_DAYS + ' | Max free transcripts: ' + MAX_FREE_TRANSCRIPTS);
});