function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function toSrtTime(sec) {
  const ms = Math.round((sec % 1) * 1000);
  return fmtTime(sec) + ',' + String(ms).padStart(3, '0');
}

function generateTranscript(order) {
  const fmt = order.format || 'txt';

  if (fmt === 'srt') {
    const srt = order.srt || buildFallbackSrt(order);
    return { blob: new Blob([srt], { type: 'application/x-subrip' }), ext: 'srt' };
  }

  if (fmt === 'txt') {
    const txt = buildTxt(order);
    return { blob: new Blob([txt], { type: 'text/plain' }), ext: 'txt' };
  }

  if (fmt === 'docx') {
    return buildDocx(order);
  }

  return { blob: new Blob([buildTxt(order)], { type: 'text/plain' }), ext: 'txt' };
}

function buildTxt(order) {
  const body = order.transcript
    ? order.transcript
    : buildFallbackLines(order).join('\n');
  return [
    'TranscribeAI Transcript',
    'Order: ' + order.id,
    'File: ' + order.fileName,
    'Language: ' + (order.lang === 'es' ? 'Spanish' : 'English'),
    '',
    body,
    '',
    '--- End of transcript ---'
  ].join('\n');
}

function buildFallbackSrt(order) {
  const lines = buildFallbackLines(order);
  const total = order.durationSec || 30;
  const per = total / lines.length;
  let srt = '';
  lines.forEach((line, i) => {
    const start = i * per;
    const end = (i + 1) * per;
    srt += (i + 1) + '\n';
    srt += toSrtTime(start) + ' --> ' + toSrtTime(end) + '\n';
    srt += line + '\n\n';
  });
  return srt;
}

function buildFallbackLines(order) {
  return [
    t('preview_line1', 'Welcome to this transcribed audio.'),
    t('preview_line2', 'The speaker introduces the main topics of todays session.'),
    t('preview_line3', 'Key points are summarized and action items are defined.'),
    t('preview_line4', 'The conversation concludes with a summary of next steps.')
  ];
}

async function buildDocx(order) {
  if (!window.JSZip) return null;
  const zip = new JSZip();

  zip.file('[Content_Types].xml', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '</Types>'
  ].join(''));

  zip.file('_rels/.rels', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '</Relationships>'
  ].join(''));

  const txt = buildTxt(order);
  const body = txt.split('\n').map(line => para(line, false)).join('');

  zip.file('word/document.xml', [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
    body,
    '</w:body></w:document>'
  ].join(''));

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob: blob, ext: 'docx' };
}

function para(text, isTitle) {
  const runs = isTitle
    ? '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>'
    : '<w:r><w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
  return '<w:p>' + runs + '</w:p>';
}

function trackOrder() {
  const input = document.getElementById('orderIdInput');
  const notFound = document.getElementById('orderNotFound');
  const details = document.getElementById('orderDetails');
  if (!input || !details) return;

  const raw = input.value.trim();
  const orderId = raw.toUpperCase();
  if (!orderId) {
    showToast(t('track_toast_id', 'Please enter an order ID.'));
    return;
  }

  const order = Orders.find(orderId);
  if (notFound) notFound.classList.add('hidden');
  if (!order) {
    if (notFound) notFound.classList.remove('hidden');
    details.classList.add('hidden');
    return;
  }

  renderOrder(order);
}

function renderOrder(order) {
  const status = Orders.getSimulatedStatus(order);
  const statusLabels = {
    received: { key: 'track_received', label: 'Order received', dot: 'received' },
    processing: { key: 'track_processing', label: 'Processing', dot: 'processing' },
    ready: { key: 'track_ready', label: 'Ready for download', dot: 'ready' }
  };

  const detailOrderId = document.getElementById('detailOrderId');
  const detailFile = document.getElementById('detailFile');
  const detailMeta = document.getElementById('detailMeta');
  const detailReceived = document.getElementById('detailReceived');
  const detailProcessing = document.getElementById('detailProcessing');
  const detailReady = document.getElementById('detailReady');
  const downloadSection = document.getElementById('downloadSection');
  const downloadBtn = document.getElementById('downloadBtn');
  const statusEl = document.getElementById('detailStatus');

  if (detailOrderId) detailOrderId.textContent = order.id;
  if (detailFile) detailFile.textContent = order.fileName;
  if (detailMeta) {
    detailMeta.textContent = (order.format || 'txt').toUpperCase() + ' · ' + (order.durationLabel || '~5 min') + ' · ' + order.price;
  }
  const created = new Date(order.createdAt).toLocaleString();
  if (detailReceived) detailReceived.textContent = created;
  if (detailProcessing) {
    detailProcessing.textContent = status === 'received' ? t('track_pending', 'Pending') : t('track_inprogress', 'In progress...');
  }
  if (detailReady) {
    detailReady.textContent = status === 'ready' ? t('track_ready_msg', 'Your transcript is ready!') : t('track_waiting', 'Waiting for processing');
  }

  if (statusEl) {
    const st = statusLabels[status];
    statusEl.innerHTML = '<div class="status-dot ' + st.dot + '"></div><span class="text-sm font-medium">' + t(st.key, st.label) + '</span>';
  }

  ['step1', 'step2', 'step3'].forEach((id, i) => {
    const step = document.getElementById(id);
    if (!step) return;
    const dot = step.querySelector('.timeline-dot');
    dot.classList.remove('received', 'processing', 'ready');
    if (i === 0) dot.classList.add('received');
    if (i === 1 && (status === 'processing' || status === 'ready')) dot.classList.add('processing');
    if (i === 2 && status === 'ready') dot.classList.add('ready');
  });

  if (downloadSection && downloadBtn) {
    if (status === 'ready') {
      downloadSection.classList.remove('hidden');
      downloadBtn.onclick = () => downloadTranscript(order);
    } else {
      downloadSection.classList.add('hidden');
    }
  }

  const details = document.getElementById('orderDetails');
  if (details) details.classList.remove('hidden');
}

async function downloadTranscript(order) {
  const result = await generateTranscript(order);
  if (!result) return;
  const a = document.createElement('a');
  const base = (order.fileName || 'transcript').replace(/\.[^.]+$/, '');
  a.href = URL.createObjectURL(result.blob);
  a.download = base + '-transcript.' + result.ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

document.addEventListener('DOMContentLoaded', () => {
  const trackBtn = document.getElementById('trackBtn');
  if (trackBtn) {
    trackBtn.addEventListener('click', () => trackOrder());
  }
  const orderIdInput = document.getElementById('orderIdInput');
  if (orderIdInput) {
    orderIdInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') trackOrder();
    });
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('id')) {
    if (orderIdInput) orderIdInput.value = params.get('id');
    trackOrder();
  }
});