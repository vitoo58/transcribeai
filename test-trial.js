global.localStorage = {
  _s: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem(k, v) { this._s[k] = String(v); }
};

const { readFileSync } = require('fs');
const vm = require('vm');
const sandbox = { localStorage, Date, Math, console };
vm.createContext(sandbox);
vm.runInContext(readFileSync('js/config.js', 'utf8'), sandbox);
vm.runInContext(readFileSync('js/trial.js', 'utf8') + '; globalThis.Trial = Trial;', sandbox);

function assert(cond, msg) {
  if (!cond) { console.log('FAIL:', msg); process.exit(1); }
  console.log('ok:', msg);
}

const t1 = sandbox.Trial.status();
assert(t1.startedAt === null && t1.daysLeft === 7, 'fresh user gets full trial days');

sandbox.localStorage.setItem('transcribeai_trial_start', String(Date.now() - 3 * 86400000));
assert(sandbox.Trial.daysLeft() === 4, '3 days elapsed => 4 days left');

sandbox.Trial.registerUse();
sandbox.Trial.registerUse();
const t2 = sandbox.Trial.status();
assert(t2.uses === 2 && t2.remainingTranscripts === 1 && t2.expired === false, 'uses counted, not expired');

sandbox.localStorage.setItem('transcribeai_trial_uses', '3');
assert(sandbox.Trial.status().expired && sandbox.Trial.status().usesExpired, 'all uses consumed => expired');

sandbox.localStorage.setItem('transcribeai_trial_start', String(Date.now() - 9 * 86400000));
sandbox.localStorage.setItem('transcribeai_trial_uses', '0');
const t3 = sandbox.Trial.status();
assert(t3.daysLeft === 0 && t3.timeExpired && t3.expired, '9 days elapsed => time expired');

const t4 = sandbox.Trial.status();
assert(sandbox.Trial.remainingTranscripts() === 3, 'remaining transcripts recompute');

console.log('ALL TRIAL TESTS PASSED');