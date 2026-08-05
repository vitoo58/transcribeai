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

  const getStatus = order => order && order.status;

  const getSimulatedStatus = order => {
    if (!order) return 'received';
    const elapsed = Date.now() - order.createdAt;
    if (elapsed > 60000) return 'ready';
    if (elapsed > 20000) return 'processing';
    return 'received';
  };

  return { getAll, save, find, create, getStatus, getSimulatedStatus, generateId };
})();