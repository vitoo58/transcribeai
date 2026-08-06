const http = require('http');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT, 10) || 3999;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: path,
      method: method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, res => {
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

async function main() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });

  let ready = false;
  for (let i = 0; i < 25; i++) {
    try { await req('GET', '/api/trial'); ready = true; break; } catch (e) { await wait(400); }
  }
  if (!ready) { console.log('FAIL: server did not start'); child.kill(); process.exit(1); }

  let orderId = null;
  try {
    const trial = await req('GET', '/api/trial');
    console.log('trial:', JSON.stringify(trial.body));
    if (!trial.body || typeof trial.body.trialDays !== 'number') throw new Error('bad trial');

    const created = await req('POST', '/api/orders', {
      email: 'a@b.com', fileName: 'test.mp3', format: 'txt', lang: 'es', turnaround: 48, price: '$2.00'
    });
    orderId = created.body && created.body.id;
    console.log('create:', created.status, 'id=', orderId);
    if (!orderId) throw new Error('no id returned');

    const found = await req('GET', '/api/orders/' + orderId);
    console.log('get:', found.status, found.body && found.body.status);
    if (found.status !== 200) throw new Error('get failed');

    const missing = await req('GET', '/api/orders/NOPE');
    console.log('404 on missing:', missing.status === 404);
    if (missing.status !== 404) throw new Error('expected 404');

    const updated = await req('PUT', '/api/orders/' + orderId + '/transcript', {
      text: 'Hola transcript', srt: '1\n00:00:00,000 --> 00:00:01,000\nHola\n\n', chunks: []
    });
    console.log('put transcript:', updated.status, 'status=', updated.body && updated.body.status);
    if (updated.status !== 200 || updated.body.status !== 'ready') throw new Error('update failed');

    const after = await req('GET', '/api/orders/' + orderId);
    console.log('after ready:', after.body && after.body.status);
    if (after.body.status !== 'ready') throw new Error('not ready after update');

    console.log('ALL BACKEND TESTS PASSED');
    child.kill();
    process.exit(0);
  } catch (e) {
    console.log('FAIL:', e.message);
    child.kill();
    process.exit(1);
  }
}

main();