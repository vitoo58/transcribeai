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
    if (!base) return;
    fetch(base + '/api/orders', {
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
      if (remote && remote.id) order.remoteId = remote.id;
    }).catch(() => {});
  }

  function pushTranscript(order) {
    const base = api();
    if (!base) return;
    const id = order.remoteId || order.id;
    fetch(base + '/api/orders/' + encodeURIComponent(id) + '/transcript', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: order.transcript, chunks: order.chunks, srt: order.srt })
    }).catch(() => {});
  }

  const saveUpdate = order => {
    const all = getAll();
    const idx = all.findIndex(o => o.id === order.id);
    if (idx >= 0) all[idx] = order;
    localStorage.setItem(KEY, JSON.stringify(all));
  };

  const getStatus = order => order && order.status;

  const getSimulatedStatus = order => {
    if (!order) return 'received';
    if (order.status === 'ready') return 'ready';
    return order.status || 'received';
  };

  return { getAll, save, find, create, complete, getStatus, getSimulatedStatus, generateId };
})();