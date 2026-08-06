const Trial = (() => {
  const START_KEY = 'transcribeai_trial_start';
  const USE_KEY = 'transcribeai_trial_uses';

  function daysBetween(startMs, endMs) {
    return Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));
  }

  function started() {
    const raw = localStorage.getItem(START_KEY);
    return raw ? parseInt(raw, 10) : null;
  }

  function start() {
    if (!started()) localStorage.setItem(START_KEY, String(Date.now()));
  }

  function uses() {
    return parseInt(localStorage.getItem(USE_KEY) || '0', 10);
  }

  function registerUse() {
    start();
    localStorage.setItem(USE_KEY, String(uses() + 1));
  }

  function daysLeft() {
    const s = started();
    if (!s) return Config.trial.days;
    return Math.max(0, Config.trial.days - daysBetween(s, Date.now()));
  }

  function remainingTranscripts() {
    return Math.max(0, Config.trial.maxFreeTranscripts - uses());
  }

  function status() {
    const s = started();
    const used = uses();
    const dl = daysLeft();
    const rem = remainingTranscripts();
    const timeExpired = s !== null && dl <= 0;
    const usesExpired = used >= Config.trial.maxFreeTranscripts;
    return {
      startedAt: s,
      uses: used,
      maxUses: Config.trial.maxFreeTranscripts,
      remainingTranscripts: rem,
      daysLeft: dl,
      expired: Config.trial.enabled && (timeExpired || usesExpired),
      timeExpired: timeExpired,
      usesExpired: usesExpired
    };
  }

  return { start, registerUse, uses, daysLeft, status, remainingTranscripts };
})();