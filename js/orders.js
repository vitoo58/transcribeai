const Orders = (() => {
  const KEY = 'transcribeai_orders';

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
    return save(order);
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
    return order;
  };

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