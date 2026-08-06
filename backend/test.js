const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function makeReq(port) {
  return (method, path, body, token) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    if (token) headers['X-Auth-Token'] = token;
    const r = http.request({ hostname: '127.0.0.1', port: port, path: path, method: method, headers: headers }, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function waitReady(req) {
  for (let i = 0; i < 30; i++) {
    try { await req('GET', '/api/trial'); return; } catch (e) { await wait(400); }
  }
  throw new Error('server did not start');
}

function spawnServer(port, extraEnv) {
  return spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port), ...(extraEnv || {}) },
    stdio: 'ignore'
  });
}

let failures = 0;
async function assert(cond, msg) {
  if (cond) { console.log('ok:', msg); }
  else { console.log('FAIL:', msg); failures++; }
}

async function main() {
  const PORT = 3999;
  const dbFile = path.join(__dirname, 'data', 'orders-main.db');
  if (fs.existsSync(dbFile)) fs.rmSync(dbFile, { force: true });
  const child = spawnServer(PORT, { DB_FILE: dbFile });
  try {
    const req = makeReq(PORT);
    await waitReady(req);

    const trial = await req('GET', '/api/trial');
    await assert(trial.status === 200 && trial.body.trialDays === 7, 'trial endpoint works');

    const created = await req('POST', '/api/orders', {
      email: 'a@b.com', fileName: 'test.mp3', format: 'txt', lang: 'es', turnaround: 48, price: '$2.00'
    });
    await assert(created.status === 201, 'create order 201');
    const id = created.body.id;
    const auth = created.body.authCode;
    await assert(!!auth && auth.length >= 40, 'authCode present in create response');

    const pubNoAuth = await req('GET', '/api/orders/' + id);
    await assert(pubNoAuth.status === 403, 'GET without auth => 403');

    const pubWithAuth = await req('GET', '/api/orders/' + id, null, auth);
    await assert(pubWithAuth.status === 200, 'GET with auth => 200');
    await assert(pubWithAuth.body.authCode === undefined, 'authCode never leaked via GET');

    const shortLookup = await req('GET', '/api/orders/' + created.body.shortId, null, auth);
    await assert(shortLookup.status === 200 && shortLookup.body.id === id, 'GET resolves by shortId');

    const missing = await req('GET', '/api/orders/NOPE', null, auth);
    await assert(missing.status === 404, '404 for unknown order');

    const wrongToken = await req('PUT', '/api/orders/' + id + '/transcript', { text: 'x' }, 'wrong-token');
    await assert(wrongToken.status === 403, 'PUT with wrong token => 403');

    const put = await req('PUT', '/api/orders/' + id + '/transcript', { text: 'Hola transcript', srt: '', chunks: [] }, auth);
    await assert(put.status === 200 && put.body.status === 'ready', 'PUT with auth marks ready');
    await assert(put.body.authCode === undefined, 'authCode not in PUT response');

    const badEmail = await req('POST', '/api/orders', { email: 'not-an-email' });
    await assert(badEmail.status === 400, 'invalid email rejected with 400');

    const hugeText = await req('PUT', '/api/orders/' + id + '/transcript', { text: 'x'.repeat(6 * 1024 * 1024) }, auth);
    await assert(hugeText.status === 400, 'payload > 5MB rejected');

    const deleteNoAuth = await req('DELETE', '/api/orders/' + id);
    await assert(deleteNoAuth.status === 403, 'DELETE without auth => 403');

    const del = await req('DELETE', '/api/orders/' + id, null, auth);
    await assert(del.status === 200 && del.body.ok === true, 'DELETE with auth works');

    const notFound = await req('GET', '/nope');
    await assert(notFound.status === 404, 'non-api path 404');
  } finally {
    child.kill();
  }
}

async function testPersistence() {
  const PORT = 3997;
  const dbFile = path.join(__dirname, 'data', 'orders-persist.db');
  if (fs.existsSync(dbFile)) fs.rmSync(dbFile, { force: true });
  let created = null;
  let child = spawnServer(PORT, { DB_FILE: dbFile });
  try {
    const req = makeReq(PORT);
    await waitReady(req);
    const r = await req('POST', '/api/orders', { email: 'persist@x.com', fileName: 'keep.mp3', format: 'txt' });
    created = r.body;
    await assert(r.status === 201 && created.id, 'persistence: order created');
  } finally {
    child.kill();
    await wait(800);
  }
  child = spawnServer(PORT, { DB_FILE: dbFile });
  try {
    const req = makeReq(PORT);
    await waitReady(req);
    const got = await req('GET', '/api/orders/' + created.id, null, created.authCode);
    await assert(got.status === 200 && got.body.email === 'persist@x.com', 'persistence: order survives server restart');
  } finally {
    child.kill();
  }
}

async function testRateLimit() {
  const PORT = 3998;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), RATE_LIMIT_PER_MIN: '3' },
    stdio: 'ignore'
  });
  try {
    const req = makeReq(PORT);
    await waitReady(req);
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const r = await req('GET', '/api/trial');
      if (r.status === 429) { got429 = true; break; }
    }
    await assert(got429, 'rate limiting returns 429 after limit');
  } finally {
    child.kill();
  }
}

(async () => {
  await main();
  await testRateLimit();
  await testPersistence();
  if (failures > 0) { console.log('TEST FAILURES: ' + failures); process.exit(1); }
  console.log('ALL BACKEND TESTS PASSED');
  process.exit(0);
})();