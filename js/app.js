const translations = {};
let currentLang = 'en';
let currentTheme = 'dark';
let selectedFile = null;
let audioDurationSec = 0;

fetch('js/i18n.json')
  .then(res => res.json())
  .then(data => {
    translations.en = data.en;
    translations.es = data.es;
    applyTranslations();
  });

function t(key, fallback) {
  const value = translations[currentLang]?.[key];
  return value !== undefined && value !== null ? value : (fallback || key);
}

function setLanguage(lang) {
  currentLang = lang;
  document.documentElement.setAttribute('data-lang', lang);
  const en = document.getElementById('lang-en');
  const es = document.getElementById('lang-es');
  if (en) en.classList.toggle('active', lang === 'en');
  if (es) es.classList.toggle('active', lang === 'es');
  localStorage.setItem('transcribeai-lang', lang);
  applyTranslations();
}

function applyTranslations() {
  if (!translations[currentLang]) return;
  const tdata = translations[currentLang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (tdata[key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.hasAttribute('placeholder')) el.placeholder = tdata[key];
      } else {
        el.textContent = tdata[key];
      }
    }
  });
  const pageBrand = translations[currentLang].nav_brand;
  const isLanding = document.querySelector('[data-i18n="hero_title"]');
  if (isLanding) {
    document.title = pageBrand + ' — ' + translations[currentLang].hero_title;
  } else if (document.title.indexOf(pageBrand) === -1) {
    document.title = pageBrand + ' — ' + document.title;
  }
  updatePrice();
}

function applyLanguages() {
  applyTranslations();
  document.querySelectorAll('select[data-i18n-options]').forEach(sel => {
    Array.from(sel.options).forEach(opt => {
      const key = opt.getAttribute('data-i18n');
      if (key && translations[currentLang]?.[key]) opt.textContent = translations[currentLang][key];
    });
  });
}

function setTheme(theme, persist) {
  currentTheme = theme;
  const toggle = document.getElementById('themeToggle');
  if (theme === 'light') {
    document.body.style.background = '#F8FAFC';
    document.body.style.color = '#1E293B';
    if (toggle) toggle.classList.add('light');
  } else {
    document.body.style.background = '#0B0E1A';
    document.body.style.color = '#E8ECF4';
    if (toggle) toggle.classList.remove('light');
  }
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) localStorage.setItem('transcribeai-theme', theme);
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark', true);
}

function initTheme() {
  const saved = localStorage.getItem('transcribeai-theme');
  const savedLang = localStorage.getItem('transcribeai-lang');
  if (savedLang === 'es' || savedLang === 'en') {
    currentLang = savedLang;
    const en = document.getElementById('lang-en');
    const es = document.getElementById('lang-es');
    if (en) en.classList.toggle('active', savedLang === 'en');
    if (es) es.classList.toggle('active', savedLang === 'es');
  }
  setTheme(saved === 'light' ? 'light' : 'dark', false);
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  const mm = Math.round(seconds / 60);
  if (h > 0) return h + 'h' + (m > 0 ? ' ' + m + 'm' : '');
  return mm + ' min';
}

function initDropZone() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  const validExts = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'mp4', 'aac'];
  const ext = file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showToast(t('upload_error_format'));
    return;
  }
  if (file.size > 500 * 1024 * 1024) {
    showToast(t('upload_error_size'));
    return;
  }
  selectedFile = file;
  audioDurationSec = 0;

  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  if (fileInfo) fileInfo.classList.remove('hidden');
  if (fileName) fileName.textContent = file.name;
  if (fileSize) fileSize.textContent = (file.size / (1024 * 1024)).toFixed(1) + ' MB';

  readDuration(file).then(sec => {
    audioDurationSec = sec;
    updatePrice();
  });
}

function readDuration(file) {
  return new Promise(resolve => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(0);
      }, 5000);
    } catch (e) {
      resolve(0);
    }
  });
}

function clearFile() {
  selectedFile = null;
  audioDurationSec = 0;
  const fileInfo = document.getElementById('fileInfo');
  const fileInput = document.getElementById('fileInput');
  if (fileInfo) fileInfo.classList.add('hidden');
  if (fileInput) fileInput.value = '';
  updatePrice();
}

function hourlyRate(turnaround) {
  const rate = { '24': 60, '48': 30 };
  return rate[turnaround] || 15;
}

function getDurationMinutes() {
  if (audioDurationSec && audioDurationSec > 0) {
    return Math.max(1, audioDurationSec / 60);
  }
  if (selectedFile) {
    return 5;
  }
  return 0;
}

function updatePrice() {
  const select = document.getElementById('turnaroundSelect');
  const turnaround = select ? select.value : '72';
  const minutes = getDurationMinutes();
  const price = (minutes * (hourlyRate(turnaround) / 60)).toFixed(2);
  const display = document.getElementById('priceDisplay');
  if (display) display.textContent = '$' + price;

  const durEl = document.getElementById('detailDuration');
  if (durEl) {
    if (selectedFile) {
      durEl.textContent = t('upload_duration') + ': ' + (formatDuration(audioDurationSec) || '~5 min');
    } else {
      durEl.textContent = '';
    }
  }
}

function submitOrder() {
  const emailEl = document.getElementById('emailInput');
  const email = emailEl ? emailEl.value.trim() : '';
  if (!email) {
    showToast(t('upload_toast_email'));
    return;
  }
  if (!email.includes('@') || !email.includes('.')) {
    showToast(t('upload_error_email'));
    return;
  }
  if (!selectedFile) {
    showToast(t('upload_toast_file'));
    return;
  }

  const format = document.getElementById('formatSelect')?.value || 'txt';
  const lang = document.getElementById('langSelect')?.value || currentLang;
  const turnaround = document.getElementById('turnaroundSelect')?.value || '72';
  const price = document.getElementById('priceDisplay')?.textContent || '$0.00';

  const order = Orders.create({
    email: email,
    fileName: selectedFile.name,
    durationSec: audioDurationSec > 0 ? Math.round(audioDurationSec) : null,
    durationLabel: formatDuration(audioDurationSec) || '~5 min',
    format: format,
    lang: lang,
    turnaround: parseInt(turnaround),
    price: price
  });

  const progress = document.getElementById('orderProgress');
  const btn = document.getElementById('submitBtn');
  const success = document.getElementById('successMsg');
  const successId = document.getElementById('successOrderId');
  const successLink = document.getElementById('successTrackLink');
  if (progress) progress.classList.remove('hidden');
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('upload_processing', 'Processing...');
  }

  let pct = 0;
  const interval = setInterval(() => {
    pct += Math.random() * 12;
    if (pct > 90) pct = 90;
    const fill = document.getElementById('progressFill');
    const pctEl = document.getElementById('progressPercent');
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    if (pct >= 90) {
      clearInterval(interval);
      if (fill) fill.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      setTimeout(() => {
        if (progress) progress.classList.add('hidden');
        if (btn) {
          btn.disabled = false;
          btn.textContent = t('upload_submit');
        }
        if (successId) successId.textContent = order.id;
        if (successLink && successLink.href) successLink.href = 'track.html?id=' + encodeURIComponent(order.id);
        if (success) success.classList.remove('hidden');
        if (selectedFile) clearFile();
        if (emailEl) emailEl.value = '';
        showToast(t('upload_submit_success'));
        if (success) success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 600);
    }
  }, 350);
}

function initFaq() {
  document.querySelectorAll('.faq-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleFaq(btn));
  });
}

function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const icon = btn.querySelector('svg');
  if (answer && answer.classList.contains('faq-answer')) {
    const isOpen = answer.classList.contains('open');
    document.querySelectorAll('.faq-answer').forEach(a => a.classList.remove('open'));
    document.querySelectorAll('.faq-toggle svg').forEach(s => s.style.transform = 'rotate(0deg)');
    if (!isOpen) {
      answer.classList.add('open');
      if (icon) icon.style.transform = 'rotate(180deg)';
    }
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function initScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDropZone();
  initForm();
  initFaq();
  initScrollReveal();
  initTrackLinks();
  updatePrice();
  const turnaroundSelect = document.getElementById('turnaroundSelect');
  if (turnaroundSelect) turnaroundSelect.addEventListener('change', updatePrice);
});

function initTrackLinks() {
  const input = document.getElementById('orderIdInput');
  if (!input) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('id')) input.value = params.get('id');
}