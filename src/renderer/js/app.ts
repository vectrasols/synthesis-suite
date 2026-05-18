// app.js — Main application controller
// Initializes Electron IPC, connects to Python backend, wires tabs & theme.
'use strict';

(async function main() {
  // ── Splash progress animation ──────────────────────────────────────────────
  const bar = document.getElementById('splashBar');
  const status = document.getElementById('splashStatus');
  let progress = 0;
  function advanceSplash(pct, msg) {
    progress = pct;
    if (bar) bar.style.width = pct + '%';
    if (status) status.textContent = msg;
  }

  advanceSplash(10, 'Initializing…');

  // ── Get backend port from Electron or fallback (dev) ──────────────────────
  let port;
  try {
    if (window.electronAPI) {
      advanceSplash(25, 'Connecting to backend engine…');
      port = await window.electronAPI.getBackendPort();
    } else {
      // Dev fallback: try default port
      port = 8374;
    }
    API.setPort(port);
    advanceSplash(50, 'Waiting for backend…');

    // Poll until backend is up (max 30s)
    let tries = 0;
    while (tries < 60) {
      try {
        await API.health();
        break;
      } catch {
        await new Promise(r => setTimeout(r, 500));
        tries++;
      }
    }
    advanceSplash(80, 'Loading interface…');
  } catch (e) {
    advanceSplash(100, 'Error: ' + e.message);
    console.error(e);
    return;
  }

  // ── App version ────────────────────────────────────────────────────────────
  if (window.electronAPI) {
    const ver = await window.electronAPI.getVersion().catch(() => '1.0.0');
    const el = document.getElementById('appVersion');
    if (el) el.textContent = `v${ver}`;
  }

  // ── Initialize tabs ────────────────────────────────────────────────────────
  VizTab.init();
  CleanTab.init();
  ModelTab.init();
  AlgoTab.init();

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.getElementById('tabNav')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tabId = btn.dataset.tab;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${tabId}`)?.classList.add('active');
  });

  // ── Theme switching ────────────────────────────────────────────────────────
  const themeSelect = document.getElementById('themeSelect');
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    document.body.className = `theme-${theme.replace(/_/g, '-')}`;
    API.setTheme(theme);
    // Re-render chart with new theme colors
    const info = document.getElementById('dataInfo')?.textContent;
    if (info) Charts.refreshChart();
    localStorage.setItem('synthesis-theme', theme);
  }

  themeSelect?.addEventListener('change', e => applyTheme(e.target.value));

  // Restore saved theme
  const savedTheme = localStorage.getItem('synthesis-theme') || 'dark';
  if (themeSelect) themeSelect.value = savedTheme;
  applyTheme(savedTheme);

  // ── Auto-update notifications ──────────────────────────────────────────────
  if (window.electronAPI) {
    window.electronAPI.onUpdateAvailable(info => {
      const banner = document.getElementById('updateBanner');
      const text = document.getElementById('updateBannerText');
      if (banner) banner.classList.remove('hidden');
      if (text) text.textContent = `Update v${info.version} is available — downloading…`;
    });

    window.electronAPI.onUpdateDownloaded(info => {
      const text = document.getElementById('updateBannerText');
      if (text) text.textContent = `v${info.version} ready to install. Restart to update.`;
    });

    document.getElementById('updateInstallBtn')?.addEventListener('click', () => {
      window.electronAPI.installUpdate();
    });

    document.getElementById('updateDismissBtn')?.addEventListener('click', () => {
      document.getElementById('updateBanner')?.classList.add('hidden');
    });
  }

  // ── Hide splash, show app ──────────────────────────────────────────────────
  advanceSplash(100, 'Ready!');
  await new Promise(r => setTimeout(r, 400));

  const splash = document.getElementById('splash');
  const app = document.getElementById('app');
  if (splash) { splash.style.opacity = '0'; splash.style.transition = 'opacity 0.4s'; setTimeout(() => splash.remove(), 400); }
  if (app) app.classList.remove('hidden');

  Utils.setStatus('Ready. Load a data file to begin.');
})();
