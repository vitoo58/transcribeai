const translations = {};
let currentLang = 'en';
let currentTheme = 'dark';
let selectedFile = null;

fetch('js/i18n.json')
  .then(res => res.json())
  .then(data => {
    translations.en = data.en;
    translations.es = data.es;
    applyTranslations();
  });

function setLanguage(lang) {
  currentLang = lang;
  document.documentElement.setAttribute('data-lang', lang);
  document.getElementById('lang-en').classList.toggle('active', lang === 'en');
  document.getElementById('lang-es').classList.toggle('active', lang === 'es');
  applyTranslations();
}

function applyTranslations() {
  if (!translations[currentLang]) return;
  const t = translations[currentLang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.hasAttribute('placeholder')) el.placeholder = t[key];
      } else {
        el.textContent = t[key];
      }
    }
  });
}

function toggleTheme() {
  const toggle = document.getElementById('themeToggle');
  if (currentTheme === 'dark') {
    currentTheme = 'light';
    document.body.style.background = '#F8FAFC';
    document.body.style.color = '#1E293B';
    toggle.classList.add('light');
  } else {
    currentTheme = 'dark';
    document.body.style.background = '#0B0E1A';
    document.body.style.color = '#E8ECF4';
    toggle.classList.remove('light');
  }
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
  const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/ogg', 'audio/flac', 'audio/mp3', 'audio/wave'];
  const ext = file.name.split('.').pop().toLowerCase();
  const validExts = ['mp3', 'wav', 'm4a', 'ogg', 'flac'];
  if (!validExts.includes(ext)) {
    showToast('Invalid file format. Please use MP3, WAV, M4A, OGG, or FLAC.');
    return;
  }
  if (file.size > 500 * 1024 * 1024) {
    showToast('File too large. Maximum size is 500MB.');
    return;
  }
  selectedFile = file;
  document.getElementById('fileInfo').classList.remove('hidden');
  document.getElementById('fileName').textContent = file.name;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  document.getElementById('fileSize').textContent = sizeMB + ' MB';
  updatePrice();
}

function clearFile() {
  selectedFile = null;
  document.getElementById('fileInfo').classList.add('hidden');
  document.getElementById('fileInput').value = '';
  updatePrice();
}

function updatePrice() {
  const turnaround = parseInt(document.getElementById('turnaroundSelect')?.value || '72');
  const baseRate = turnaround <= 24 ? 1.00 : turnaround <= 48 ? 0.50 : 0.25;
  const minutes = selectedFile ? 5 : 0;
  const price = (minutes * baseRate).toFixed(2);
  const display = document.getElementById('priceDisplay');
  if (display) display.textContent = '$' + price;
}

function initForm() {
  const submitBtn = document.getElementById('submitBtn');
  if (!submitBtn) return;
  submitBtn.addEventListener('click', () => {
    if (!selectedFile) {
      showToast('Please select an audio file first.');
      return;
    }
    const email = document.getElementById('emailInput')?.value;
    if (email && !email.includes('@')) {
      showToast('Please enter a valid email address.');
      return;
    }
    const progress = document.getElementById('orderProgress');
    const btn = document.getElementById('submitBtn');
    const success = document.getElementById('successMsg');
    if (progress) progress.classList.remove('hidden');
    if (btn) btn.disabled = true;
    if (btn) btn.textContent = 'Processing...';
    let pct = 0;
    const interval = setInterval(() => {
      pct += Math.random() * 15;
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
          if (btn) btn.disabled = false;
          if (btn) btn.textContent = 'Submit order';
          if (success) success.classList.remove('hidden');
          if (selectedFile) clearFile();
          const emailInput = document.getElementById('emailInput');
          if (emailInput) emailInput.value = '';
          showToast(translations[currentLang]?.upload_submit_success || 'Order submitted successfully!');
        }, 500);
      }
    }, 400);
  });
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

function initTheme() {
  const saved = localStorage.getItem('transcribeai-theme');
  if (saved === 'light') {
    currentTheme = 'light';
    document.body.style.background = '#F8FAFC';
    document.body.style.color = '#1E293B';
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.classList.add('light');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initDropZone();
  initForm();
  initFaq();
  initScrollReveal();
  updatePrice();
  const turnaroundSelect = document.getElementById('turnaroundSelect');
  if (turnaroundSelect) turnaroundSelect.addEventListener('change', updatePrice);
});