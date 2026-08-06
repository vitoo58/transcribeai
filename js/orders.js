const Orders = (() => {
  const KEY = 'transcribeai_orders';

  const api = () => (typeof Config !== 'undefined' && Config.apiBase) ? Config.apiBase.replace(/\/$/, '') : '';

  const generateId = () => {
    return 'TRN-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  };

  const getAll = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  };

  const save = order => {
    const all = getAll();
    all.unshift(order);
    localStorage.setItem(KEY, JSON.stringify(all));
    return order;
  };

  const find = id => {
    const normalized = id.toUpperCase();
    return getAll().find(o => o.id === normalized || o.shortId === normalized) || null;
  };

  const create = data => {
    const order = {
      id: generateId(),
      shortId: generateId().split('-').pop(),
      createdAt: Date.now(),
      status: 'received',
      ...data
    };
    const saved = save(order);
    pushOrder(saved);
    return saved;
  };

  const complete = (id, transcriptData) => {
    const order = find(id);
    if (!order) return null;
    order.transcript = transcriptData.text || '';
    order.chunks = transcriptData.chunks || [];
    order.srt = transcriptData.srt || '';
    order.transcribedAt = Date.now();
    order.status = 'ready';
    saveUpdate(order);
    pushTranscript(order);
    return order;
  };

  function pushOrder(order) {
    const base = api();
    if (!base) return Promise.resolve();
    const p = fetch(base + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: order.email || '',
        fileName: order.fileName || '',
        durationSec: order.durationSec || null,
        format: order.format || 'txt',
        lang: order.lang || 'en',
        turnaround: order.turnaround || 72,
        price: order.price || '$0.00'
      })
    }).then(r => r.json()).then(remote => {
      if (remote && remote.id) {
        order.remoteId = remote.id;
        order.authCode = remote.authCode || '';
        saveUpdate(order);
      }
    }).catch(() => {});
    order._sync = p;
    return p;
  }

  function pushTranscript(order) {
    const base = api();
    if (!base) return;
    const wait = order._sync || Promise.resolve();
    wait.then(() => {
      const id = order.remoteId || order.id;
      const headers = { 'Content-Type': 'application/json' };
      if (order.authCode) headers['X-Auth-Token'] = order.authCode;
      fetch(base + '/api/orders/' + encodeURIComponent(id) + '/transcript', {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({ text: order.transcript, chunks: order.chunks, srt: order.srt })
      }).catch(() => {});
    });
  }

  const saveUpdate = order => {
    const all = getAll();
    const idx = all.findIndex(o => o.id === order.id);
    if (idx >= 0) all[idx] = order;
    localStorage.setItem(KEY, JSON.stringify(all));
  };

  async function fetchRemote(id, authCode) {
    const base = api();
    if (!base || !id || !authCode) return null;
    try {
      const r = await fetch(base + '/api/orders/' + encodeURIComponent(id), {
        headers: { 'X-Auth-Token': authCode }
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data && data.id ? data : null;
    } catch (e) {
      return null;
    }
  }

  const syncRemote = async order => {
    if (!order || !order.authCode) return order;
    const remoteId = order.remoteId || order.id;
    const remote = await fetchRemote(remoteId, order.authCode);
    if (!remote) return order;
    let changed = false;
    if (remote.transcript && remote.transcript !== order.transcript) {
      order.transcript = remote.transcript;
      order.chunks = remote.chunks || order.chunks || [];
      order.srt = remote.srt || order.srt || '';
      changed = true;
    }
    if (remote.status && remote.status !== order.status) {
      order.status = remote.status;
      changed = true;
    }
    if (changed) saveUpdate(order);
    return order;
  };

  const getStatus = order => order && order.status;

  const getSimulatedStatus = order => {
    if (!order) return 'received';
    if (order.status === 'ready') return 'ready';
    return order.status || 'received';
  };

  return { getAll, save, find, create, complete, syncRemote, fetchRemote, getStatus, getSimulatedStatus, generateId };
})();