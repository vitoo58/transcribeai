function trackOrder() {
  const input = document.getElementById('orderIdInput');
  const notFound = document.getElementById('orderNotFound');
  const details = document.getElementById('orderDetails');
  if (!input || !details) return;

  const orderId = input.value.trim().toUpperCase();
  if (!orderId) {
    showToast('Please enter an order ID.');
    return;
  }

  if (notFound) notFound.classList.add('hidden');

  const statuses = ['received', 'processing', 'ready'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  document.getElementById('detailOrderId').textContent = 'TRN-' + orderId;

  const statusMap = {
    received: { labelKey: 'track_status_received', dotClass: 'received' },
    processing: { labelKey: 'track_status_processing', dotClass: 'processing' },
    ready: { labelKey: 'track_status_ready', dotClass: 'ready' }
  };

  const status = statusMap[randomStatus];
  const statusEl = document.getElementById('detailStatus');
  if (statusEl) {
    statusEl.innerHTML = '<div class="status-dot ' + status.dotClass + '"></div><span class="text-sm font-medium">' + (translations[currentLang]?.[status.labelKey] || status.labelKey) + '</span>';
  }

  document.getElementById('detailReceived').textContent = dateStr + ' at ' + timeStr;
  document.getElementById('detailProcessing').textContent = randomStatus === 'processing' ? 'In progress...' : 'Pending';
  document.getElementById('detailReady').textContent = randomStatus === 'ready' ? 'Your transcript is ready!' : 'Waiting for processing';

  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const downloadSection = document.getElementById('downloadSection');

  if (step1) step1.querySelector('.timeline-dot').classList.add('received');
  if (step2) step2.querySelector('.timeline-dot').classList.add(randomStatus === 'received' ? 'received' : 'processing');
  if (step3) step3.querySelector('.timeline-dot').classList.add(randomStatus);

  if (downloadSection && randomStatus === 'ready') {
    downloadSection.classList.remove('hidden');
  }

  details.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  const trackBtn = document.getElementById('trackBtn');
  if (trackBtn) {
    trackBtn.addEventListener('click', trackOrder);
  }
  const orderIdInput = document.getElementById('orderIdInput');
  if (orderIdInput) {
    orderIdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') trackOrder();
    });
  }
});