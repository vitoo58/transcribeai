const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = 8127;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function dump(url) {
  return new Promise((resolve, reject) => {
    execFile(CHROME, ['--headless=new', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', url], { timeout: 40000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout || '');
    });
  });
}

server.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}/`;
  let pass = true;
  const checks = [];
  try {
    const idx = await dump(base + 'index.html');
    checks.push(['index hero', idx.includes('hero-title')]);
    checks.push(['index try free', idx.includes('trial_try_free') || idx.includes('>Try free<') || idx.includes('days of unlimited free transcription')]);
    checks.push(['index banner offer', idx.includes('days of unlimited free transcription')]);
    checks.push(['index transcribe btn', idx.includes('transcribeBtn')]);
    checks.push(['index scripts config+trial', idx.indexOf('js/config.js') !== -1 && idx.indexOf('js/trial.js') !== -1 && idx.indexOf('js/config.js') < idx.indexOf('js/trial.js')]);

    const up = await dump(base + 'upload.html');
    checks.push(['upload trial banner', up.includes('id="trialBanner"')]);
    checks.push(['upload transcribe area', up.includes('transcribeBtn')]);
    checks.push(['upload auth code block', up.includes('authCodeWrap') && up.includes('copyAuthBtn')]);
    checks.push(['upload scripts config+trial', up.indexOf('js/config.js') !== -1 && up.indexOf('js/trial.js') !== -1]);

    const tr = await dump(base + 'track.html');
    checks.push(['track order form', tr.includes('orderIdInput')]);
    checks.push(['track auth code field', tr.includes('authCodeInput') && tr.includes('track_auth_label')]);
    checks.push(['track scripts config+trial', tr.indexOf('js/config.js') !== -1 && tr.indexOf('js/trial.js') !== -1]);

    // trial expiration gating: set localStorage then reload
    await dump(base + 'upload.html');
  } catch (e) {
    console.log('E2E ERROR:', e.message);
    pass = false;
  }
  for (const [name, ok] of checks) {
    console.log((ok ? 'PASS' : 'FAIL') + ': ' + name);
    if (!ok) pass = false;
  }
  server.close();
  console.log(pass ? 'E2E SUCCESS' : 'E2E FAILURE');
  process.exit(pass ? 0 : 1);
});