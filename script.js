function loadState(key, fallback) {
  try { const v = localStorage.getItem('os_' + key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveState(key, value) {
  try { localStorage.setItem('os_' + key, JSON.stringify(value)); } catch {}
}

const windows = new Map();
let zIndexCounter = 100;
let activeWindowId = null;
let activeDrag = null;
let activeResize = null;
let iconDragState = null;

const settingsState = {
  accent: loadState('accent', '#6366f1'),
  glass: loadState('glass', true),
  animations: loadState('anim', true),
  volume: loadState('volume', 80),
  wifi: loadState('wifi', true),
  dnd: loadState('dnd', false),
  wallpaper: loadState('wallpaper', 0),
};
let isUpgraded = loadState('upgraded', false);

function saveSettings() {
  saveState('accent', settingsState.accent);
  saveState('glass', settingsState.glass);
  saveState('anim', settingsState.animations);
  saveState('volume', settingsState.volume);
  saveState('wifi', settingsState.wifi);
  saveState('dnd', settingsState.dnd);
  saveState('wallpaper', settingsState.wallpaper);
}
function saveUpgrade() { saveState('upgraded', true); }

const desktop = document.getElementById('desktop');
const snapPreview = document.getElementById('snap-preview');
const openAppsContainer = document.getElementById('open-apps');
const spotlightOverlay = document.getElementById('spotlight-overlay');
const spotlightInput = document.getElementById('spotlight-input');
const spotlightResults = document.getElementById('spotlight-results');
const controlCenter = document.getElementById('control-center');
const controlCenterBtn = document.getElementById('cc-btn');
const contextMenu = document.getElementById('context-menu');
const selectionBox = document.getElementById('selection-box');
const osMenu = document.getElementById('os-menu');
const osLogoBtn = document.getElementById('os-logo-btn');
const desktopIcons = document.querySelector('.desktop-icons');

function applyGlassSetting() {
  document.documentElement.classList.toggle('no-glass', !settingsState.glass);
}

const WALLPAPERS = [
  { name: 'Nebula', css: 'radial-gradient(ellipse 700px 500px at 20% 10%, rgba(99,102,241,0.20) 0%, transparent 70%), radial-gradient(ellipse 600px 600px at 85% 80%, rgba(139,92,246,0.14) 0%, transparent 70%), #08080f' },
  { name: 'Sunset', css: 'linear-gradient(160deg, #1a0f2e 0%, #3d1a4a 45%, #7c2d4a 75%, #c2542f 100%)' },
  { name: 'Ocean', css: 'linear-gradient(150deg, #041b2d 0%, #073a4c 45%, #0b6478 80%, #1a9e8f 100%)' },
  { name: 'Forest', css: 'linear-gradient(160deg, #0a1a0f 0%, #16321f 50%, #1f4a2b 85%, #3a6b3a 100%)' },
  { name: 'Mono', css: '#0c0c10' },
  { name: 'Ember', css: 'radial-gradient(ellipse 800px 500px at 50% 100%, rgba(239,68,68,0.18) 0%, transparent 70%), #0a0605' },
];

function applyWallpaper() {
  const wp = WALLPAPERS[settingsState.wallpaper] || WALLPAPERS[0];
  desktop.style.background = wp.css;
}

const apps = {
  notepad: { title: 'Notes', width: 500, height: 380, icon: '\u{1F4DD}',
    factory: () => document.getElementById('tpl-notepad').content.cloneNode(true) },
  calculator: { title: 'Calculator', width: 320, height: 420, icon: '\u{1F9EE}',
    factory: () => { const n = document.getElementById('tpl-calculator').content.cloneNode(true); initCalculator(n); return n; } },
  settings: { title: 'Settings', width: 400, height: 300, icon: '\u{2699}\u{FE0F}',
    factory: () => { const n = document.getElementById('tpl-settings').content.cloneNode(true); initSettings(n); return n; } },
  console: { title: 'Console', width: 560, height: 380, icon: '>_',
    factory: () => { const n = document.getElementById('tpl-console').content.cloneNode(true); initConsole(n); return n; } },
  browser: { title: 'Browser', width: 700, height: 500, icon: '\u{1F310}',
    factory: () => { const n = document.getElementById('tpl-browser').content.cloneNode(true); initBrowser(n); return n; } },
  video: { title: 'Mr. Robot', width: 640, height: 420, icon: '\u{1F4FA}',
    factory: () => document.getElementById('tpl-video').content.cloneNode(true) },
};

const FREE_WINDOW_LIMIT = 3;
let windowCascadeIndex = 0;

function clampPosition(left, top, w, h) {
  const taskbar = 52, statusBar = 28;
  return {
    left: Math.max(-w + 60, Math.min(left, window.innerWidth - 60)),
    top: Math.max(statusBar, Math.min(top, window.innerHeight - taskbar - 20))
  };
}

function getCascadePosition(w, h) {
  const stepX = 150;
  const stepY = 100;
  const maxCascade = 6;
  const idx = windowCascadeIndex % maxCascade;
  windowCascadeIndex++;
  const left = 80 + idx * stepX;
  const top = 60 + idx * stepY;
  return clampPosition(left, top, w, h);
}

function openApp(appId) {
  const app = apps[appId];
  if (!app) return;
  if (!isUpgraded && windows.size >= FREE_WINDOW_LIMIT) {
    showUpgradeNotification('Free plan: max ' + FREE_WINDOW_LIMIT + ' windows. Upgrade to open more.');
    return;
  }
  const id = 'win-' + Date.now();
  const tpl = document.getElementById('tpl-window');
  const win = tpl.content.firstElementChild.cloneNode(true);
  win.dataset.id = id;
  win.dataset.app = appId;
  win.style.width = app.width + 'px';
  win.style.height = app.height + 'px';
  const pos = getCascadePosition(app.width, app.height);
  win.style.left = pos.left + 'px';
  win.style.top = pos.top + 'px';
  win.style.zIndex = ++zIndexCounter;
  win.querySelector('.window-title').textContent = app.title;
  win.querySelector('.window-content').appendChild(app.factory());
  win.querySelector('.close').onclick = () => closeWindow(id);
  win.querySelector('.minimize').onclick = () => minimizeWindow(id);
  win.querySelector('.maximize').onclick = () => toggleMaximize(id);
  win.addEventListener('mousedown', () => focusWindow(id));
  setupDrag(win); setupResize(win); setupSnap(win);
  desktop.appendChild(win);
  windows.set(id, { el: win, appId, maximized: false, prevRect: null });
  focusWindow(id); updateTaskbar();
  if (settingsState.animations) {
    win.animate([{ opacity: 0, transform: 'scale(0.92) translateY(12px)' }, { opacity: 1, transform: 'scale(1) translateY(0)' }],
      { duration: 250, easing: 'cubic-bezier(0.16,1,0.3,1)' });
  }
}

function closeWindow(id) {
  const w = windows.get(id);
  if (!w) return;
  const finish = () => { w.el.remove(); windows.delete(id); if (activeWindowId === id) activeWindowId = null; updateTaskbar(); };
  if (settingsState.animations) {
    w.el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.92) translateY(12px)' }],
      { duration: 180 }).onfinish = finish;
  } else finish();
}

function minimizeWindow(id) {
  const w = windows.get(id); if (!w) return;
  w.el.classList.add('minimized');
  if (activeWindowId === id) activeWindowId = null;
  updateTaskbar();
}

function toggleMaximize(id) {
  const w = windows.get(id); if (!w) return;
  if (w.maximized) {
    const r = w.prevRect;
    w.el.style.left = r.left; w.el.style.top = r.top; w.el.style.width = r.width; w.el.style.height = r.height;
    w.el.classList.remove('maximized'); w.maximized = false;
  } else {
    w.prevRect = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
    w.el.classList.add('maximized'); w.maximized = true;
  }

}

function focusWindow(id) {
  const w = windows.get(id); if (!w || w.el.classList.contains('minimized')) return;
  w.el.style.zIndex = ++zIndexCounter;
  w.el.classList.add('active');
  if (activeWindowId && activeWindowId !== id) {
    const prev = windows.get(activeWindowId); if (prev) prev.el.classList.remove('active');
  }
  activeWindowId = id; updateTaskbar();
}

function restoreWindow(id) {
  const w = windows.get(id); if (!w) return;
  w.el.classList.remove('minimized'); focusWindow(id);
}

function hideSnapPreview() { snapPreview.classList.add('hidden'); }

document.addEventListener('mousemove', (e) => {
  if (activeDrag) {
    const pos = clampPosition(activeDrag.initLeft + e.clientX - activeDrag.startX, activeDrag.initTop + e.clientY - activeDrag.startY, activeDrag.win.offsetWidth, activeDrag.win.offsetHeight);
    activeDrag.win.style.left = pos.left + 'px'; activeDrag.win.style.top = pos.top + 'px';
    showSnapPreview(e.clientX);
  }
  if (activeResize) {
    const r = activeResize, dx = e.clientX - r.startX, dy = e.clientY - r.startY;
    if (r.dir.includes('e')) r.win.style.width = Math.max(280, r.startW + dx) + 'px';
    if (r.dir.includes('s')) r.win.style.height = Math.max(180, r.startH + dy) + 'px';
    if (r.dir.includes('w')) { const nw = Math.max(280, r.startW - dx); r.win.style.width = nw + 'px'; r.win.style.left = (r.startL + r.startW - nw) + 'px'; }
    if (r.dir.includes('n')) { const nh = Math.max(180, r.startH - dy); r.win.style.height = nh + 'px'; r.win.style.top = (r.startT + r.startH - nh) + 'px'; }
  }
  if (iconDragState && iconDragState.ghost) {
    iconDragState.ghost.style.left = (e.clientX - iconDragState.offsetX) + 'px';
    iconDragState.ghost.style.top = (e.clientY - iconDragState.offsetY) + 'px';
  }
  if (selectState.active) {
    const x = Math.min(selectState.startX, e.clientX);
    const y = Math.min(selectState.startY, e.clientY);
    const w = Math.abs(e.clientX - selectState.startX);
    const h = Math.abs(e.clientY - selectState.startY);
    Object.assign(selectionBox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', display: 'block' });
    updateIconSelection();
  }
});

document.addEventListener('mouseup', () => {
  if (activeDrag) {
    activeDrag.win.style.transition = ''; document.body.style.cursor = '';
    const snap = getSnapZone(activeDrag.lastX); if (snap) applySnap(activeDrag.win, snap);
    hideSnapPreview(); activeDrag = null;
  }
  if (activeResize) { activeResize.win.style.transition = ''; activeResize = null; }
  if (selectState.active) {
    selectState.active = false;
    selectionBox.style.display = 'none';
  }
});

document.addEventListener('mouseleave', () => { hideSnapPreview(); });

function setupDrag(win) {
  const titlebar = win.querySelector('.window-titlebar');
  titlebar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.window-controls')) return;
    hideSnapPreview(); win.style.transition = 'none'; document.body.style.cursor = 'grabbing';
    activeDrag = { win, startX: e.clientX, startY: e.clientY, initLeft: win.offsetLeft, initTop: win.offsetTop, lastX: e.clientX };
  });
}

function showSnapPreview(x) {
  const zone = getSnapZone(x);
  if (!zone) { snapPreview.classList.add('hidden'); return; }
  Object.assign(snapPreview.style, { left: zone.left, top: zone.top, width: zone.width, height: zone.height });
  snapPreview.classList.remove('hidden');
}

function getSnapZone(x) {
  const w = window.innerWidth, h = window.innerHeight - 52, m = 40;
  if (x < m) return { left: '0', top: '28px', width: '50%', height: (h - 28) + 'px' };
  if (x > w - m) return { left: '50%', top: '28px', width: '50%', height: (h - 28) + 'px' };
  return null;
}

function applySnap(win, zone) {
  const w = windows.get(win.dataset.id);
  if (w && w.maximized) { w.el.classList.remove('maximized'); w.maximized = false; }
  Object.assign(win.style, { left: zone.left, top: zone.top, width: zone.width, height: zone.height });
}

function setupResize(win) {
  win.querySelectorAll('.resize-handle').forEach(h => {
    h.addEventListener('mousedown', (e) => {
      e.stopPropagation(); win.style.transition = 'none';
      activeResize = { win, dir: h.className.split(' ').find(c => c.startsWith('resize-')).replace('resize-', ''),
        startX: e.clientX, startY: e.clientY, startW: win.offsetWidth, startH: win.offsetHeight, startL: win.offsetLeft, startT: win.offsetTop };
    });
  });
}

function setupSnap(win) {
  win.querySelector('.window-titlebar').addEventListener('dblclick', (e) => {
    if (e.target.closest('.window-controls')) return; toggleMaximize(win.dataset.id);
  });
}

function updateTaskbar() {
  openAppsContainer.innerHTML = '';
  windows.forEach((w, id) => {
    const app = apps[w.appId];
    const btn = document.createElement('button');
    btn.className = 'taskbar-app';
    if (id === activeWindowId && !w.el.classList.contains('minimized')) btn.classList.add('active');
    if (w.el.classList.contains('minimized')) btn.classList.add('minimized');
    btn.innerHTML = '<span>' + app.icon + '</span><span>' + app.title + '</span>';
    btn.onclick = () => {
      if (w.el.classList.contains('minimized')) restoreWindow(id);
      else if (id === activeWindowId) minimizeWindow(id);
      else focusWindow(id);
    };
    openAppsContainer.appendChild(btn);
  });
}

const selectState = { active: false, startX: 0, startY: 0 };

desktop.addEventListener('mousedown', (e) => {
  if (e.target.closest('.icon') || e.target.closest('.window') || e.target.closest('.fab')) return;
  if (e.button !== 0) return;
  selectState.active = true;
  selectState.startX = e.clientX;
  selectState.startY = e.clientY;
  desktopIcons.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
});

function updateIconSelection() {
  const box = selectionBox.getBoundingClientRect();
  desktopIcons.querySelectorAll('.icon').forEach(icon => {
    const r = icon.getBoundingClientRect();
    const overlaps = !(r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom);
    icon.classList.toggle('selected', overlaps);
  });
}

function showUpgradeNotification(msg) {
  const toast = document.createElement('div');
  toast.className = 'upgrade-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3000);
}

function initCalculator(root) {
  const display = root.querySelector('.calc-display');
  let current = '0', previous = '', operator = null, resetNext = false;
  function updateDisplay() { display.textContent = current; }
  function compute(a, b, op) {
    const x = parseFloat(a), y = parseFloat(b);
    switch (op) {
      case 'add': return x + y;
      case 'subtract': return x - y;
      case 'multiply': return x * y;
      case 'divide': return y !== 0 ? x / y : 'Error';
      default: return b;
    }
  }
  root.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const val = btn.textContent.trim();
      if (action === 'clear') { current = '0'; previous = ''; operator = null; }
      else if (action === 'sign') { current = String(-parseFloat(current)); }
      else if (action === 'percent') { current = String(parseFloat(current) / 100); }
      else if (action === 'equals') {
        if (operator && previous !== '') {
          current = String(compute(previous, current, operator));
          previous = ''; operator = null; resetNext = true;
        }
      }
      else if (['add','subtract','multiply','divide'].includes(action)) {
        if (operator && previous !== '' && !resetNext) {
          current = String(compute(previous, current, operator));
        }
        previous = current; operator = action; resetNext = true;
      }
      else {
        if (resetNext || current === '0') { current = val; resetNext = false; }
        else { current += val; }
      }
      updateDisplay();
    });
  });
}

function initSettings(root) {
  const accentPicker = root.querySelector('#accent-picker');
  const glassToggle = root.querySelector('#glass-toggle');
  const animToggle = root.querySelector('#anim-toggle');
  accentPicker.value = settingsState.accent;
  glassToggle.checked = settingsState.glass;
  animToggle.checked = settingsState.animations;
  accentPicker.onchange = () => { settingsState.accent = accentPicker.value; document.documentElement.style.setProperty('--accent', settingsState.accent); saveSettings(); };
  glassToggle.onchange = () => { settingsState.glass = glassToggle.checked; saveSettings(); applyGlassSetting(); };
  renderWallpaperGrid(root);
  animToggle.onchange = () => { settingsState.animations = animToggle.checked; saveSettings(); document.documentElement.classList.toggle('no-anim', !animToggle.checked); };
}

function renderWallpaperGrid(root) {
  const grid = root.querySelector('#wallpaper-grid');
  if (!grid) return;
  grid.innerHTML = '';
  WALLPAPERS.forEach((wp, i) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'wallpaper-swatch' + (i === settingsState.wallpaper ? ' active' : '');
    swatch.style.background = wp.css;
    swatch.title = wp.name;
    swatch.setAttribute('aria-label', wp.name);
    swatch.onclick = () => {
      settingsState.wallpaper = i;
      saveSettings();
      applyWallpaper();
      grid.querySelectorAll('.wallpaper-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    };
    grid.appendChild(swatch);
  });
}

function initConsole(root) {
  const output = root.querySelector('.console-output');
  const input = root.querySelector('.console-input');
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.textContent = 'Welcome to FreeOs Console. Type "help" for commands.';
  output.appendChild(welcome);
  function log(text, className = '') {
    const div = document.createElement('div');
    div.className = 'result ' + className;
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }
  function exec(cmd) {
    const line = document.createElement('div');
    line.className = 'cmd-line';
    line.innerHTML = '<span class="prompt">></span> ' + cmd;
    output.appendChild(line);
    const c = cmd.trim().toLowerCase();
    if (c === 'help') log('Commands: help, clear, echo <text>, date, time, version, apps, upgrade');
    else if (c === 'clear') output.innerHTML = '';
    else if (c.startsWith('echo ')) log(cmd.slice(5));
    else if (c === 'date') log(new Date().toLocaleDateString());
    else if (c === 'time') log(new Date().toLocaleTimeString());
    else if (c === 'version') log('FreeOs 1.0.0');
    else if (c === 'apps') log('Available: notepad, calculator, settings, console, browser, video');
    else if (c === 'upgrade') showUpgradeNotification('Opening upgrade...');
    else if (c === '') {}
    else log('Unknown command: ' + cmd, 'error');
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { exec(input.value); input.value = ''; }
  });
}

function initBrowser(root) {
  const urlInput = root.querySelector('.browser-url');
  const goBtn = root.querySelector('.browser-go');
  const frame = root.querySelector('.browser-frame');
  function navigate() {
    let url = urlInput.value.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    try { frame.src = url; } catch (e) { console.error(e); }
  }
  goBtn.onclick = navigate;
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(); });
  frame.addEventListener('load', () => { try { urlInput.value = frame.contentWindow.location.href; } catch {} });
}

document.querySelectorAll('.icon').forEach(icon => {
  icon.addEventListener('click', () => openApp(icon.dataset.app));
  icon.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openApp(icon.dataset.app); } });
});

document.getElementById('buy-plan').onclick = () => {
  const toast = document.getElementById('upsell-toast');
  toast.classList.remove('hidden');
};

document.querySelector('.toast-close').onclick = () => {
  document.getElementById('upsell-toast').classList.add('hidden');
};

document.getElementById('payment-form').onsubmit = (e) => {
  e.preventDefault();
  isUpgraded = true;
  saveUpgrade();
  document.getElementById('upsell-toast').classList.add('hidden');
  showUpgradeNotification('Upgraded! Unlimited windows unlocked.');
};

const startBtn = document.querySelector('.start-btn');
const openApps = document.getElementById('open-apps');

function toggleOsMenu(anchor) {
  const willShow = osMenu.classList.contains('hidden');
  osMenu.classList.toggle('hidden');
  if (willShow) {
    const r = anchor.getBoundingClientRect();
    // Prefer opening upward from the taskbar, downward from the status bar.
    if (anchor === startBtn) {
      osMenu.style.left = r.left + 'px';
      osMenu.style.top = '';
      osMenu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    } else {
      osMenu.style.left = r.left + 'px';
      osMenu.style.bottom = '';
      osMenu.style.top = (r.bottom + 6) + 'px';
    }
  }
}

startBtn.onclick = (e) => {
  e.stopPropagation();
  toggleOsMenu(startBtn);
};

osLogoBtn.onclick = (e) => {
  e.stopPropagation();
  toggleOsMenu(osLogoBtn);
};

document.querySelectorAll('.os-menu-item').forEach(item => {
  item.onclick = () => {
    const action = item.dataset.action;
    if (action === 'about') alert('FreeOs - A web desktop experience');
    else if (action === 'settings') openApp('settings');
    else if (action === 'reset') { localStorage.clear(); location.reload(); }
    osMenu.classList.add('hidden');
  };
});

document.addEventListener('click', (e) => {
  if (!osMenu.contains(e.target) && e.target !== startBtn) osMenu.classList.add('hidden');
  if (!controlCenter.contains(e.target) && e.target !== controlCenterBtn) controlCenter.classList.add('hidden');
  [document.getElementById('sb-wifi-popover'), document.getElementById('sb-battery-popover'), document.getElementById('sb-clock-popover')].forEach(p => {
    if (!p.contains(e.target)) p.classList.add('hidden');
  });
  contextMenu.classList.add('hidden');
});

controlCenterBtn.onclick = (e) => { e.stopPropagation(); controlCenter.classList.toggle('hidden'); };

document.querySelectorAll('.cc-toggle').forEach(btn => {
  const id = btn.id.replace('cc-', '');
  const key = id === 'anim' ? 'animations' : id;
  btn.classList.toggle('active', settingsState[key]);
  btn.onclick = () => {
    settingsState[key] = !settingsState[key];
    btn.classList.toggle('active', settingsState[key]);
    if (key === 'glass') applyGlassSetting();
    if (key === 'wifi') document.getElementById('wifi-status').textContent = settingsState.wifi ? 'Connected' : 'Disconnected';
    saveSettings();
  };
});

document.getElementById('cc-volume').value = settingsState.volume;
document.getElementById('cc-volume').oninput = (e) => { settingsState.volume = parseInt(e.target.value); saveSettings(); };
document.getElementById('sb-volume').value = settingsState.volume;
document.getElementById('sb-volume').oninput = (e) => { settingsState.volume = parseInt(e.target.value); document.getElementById('cc-volume').value = settingsState.volume; saveSettings(); };

document.getElementById('sb-wifi').onclick = (e) => { e.stopPropagation(); document.getElementById('sb-wifi-popover').classList.toggle('hidden'); };
document.getElementById('sb-battery').onclick = (e) => { e.stopPropagation(); document.getElementById('sb-battery-popover').classList.toggle('hidden'); };
document.getElementById('sb-clock').onclick = (e) => { e.stopPropagation(); document.getElementById('sb-clock-popover').classList.toggle('hidden'); };

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.icon') || e.target.closest('.window')) return;
  e.preventDefault();
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
  contextMenu.classList.remove('hidden');
});

document.querySelectorAll('.ctx-item').forEach(item => {
  item.onclick = () => {
    const action = item.dataset.action;
    if (action === 'refresh') location.reload();
    else if (action === 'arrange') {
      desktopIcons.classList.remove('freeform');
      desktopIcons.querySelectorAll('.icon').forEach(i => { i.style.left = ''; i.style.top = ''; });
      saveIconLayout({});
    }
    else if (action === 'wallpaper') {
      settingsState.wallpaper = (settingsState.wallpaper + 1) % WALLPAPERS.length;
      saveSettings(); applyWallpaper();
      showUpgradeNotification('Wallpaper: ' + WALLPAPERS[settingsState.wallpaper].name);
    }
    else if (action === 'about') alert('FreeOs - A web desktop experience');
    contextMenu.classList.add('hidden');
  };
});

function loadIconLayout() { return loadState('iconLayout', {}); }
function saveIconLayout(layout) { saveState('iconLayout', layout); }

function applySavedIconLayout() {
  const layout = loadIconLayout();
  const ids = Object.keys(layout);
  if (!ids.length) return;
  desktopIcons.classList.add('freeform');
  ids.forEach(appId => {
    const icon = desktopIcons.querySelector('.icon[data-app="' + appId + '"]');
    if (!icon) return;
    icon.style.left = layout[appId].left + 'px';
    icon.style.top = layout[appId].top + 'px';
  });
}

desktopIcons.addEventListener('mousedown', (e) => {
  const icon = e.target.closest('.icon');
  if (!icon) return;
  const rect = desktopIcons.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  iconDragState = {
    icon,
    startX: e.clientX, startY: e.clientY,
    offsetX: e.clientX - iconRect.left, offsetY: e.clientY - iconRect.top,
    containerRect: rect,
    moved: false,
    ghost: null,
  };
});

document.addEventListener('mousemove', (e) => {
  if (!iconDragState) return;
  const dx = e.clientX - iconDragState.startX;
  const dy = e.clientY - iconDragState.startY;
  if (!iconDragState.moved && Math.hypot(dx, dy) > 4) {
    iconDragState.moved = true;
    iconDragState.ghost = iconDragState.icon.cloneNode(true);
    iconDragState.ghost.classList.add('icon-ghost');
    document.body.appendChild(iconDragState.ghost);
    iconDragState.icon.classList.add('dragging');
  }
});

document.addEventListener('mouseup', (e) => {
  if (iconDragState) {
    if (iconDragState.moved) {
      const desktopRect = desktop.getBoundingClientRect();
      let left = e.clientX - desktopRect.left - iconDragState.offsetX;
      let top = e.clientY - desktopRect.top - iconDragState.offsetY;
      left = Math.max(0, Math.min(left, desktopRect.width - iconDragState.icon.offsetWidth));
      top = Math.max(0, Math.min(top, desktopRect.height - iconDragState.icon.offsetHeight - 60));
      desktopIcons.classList.add('freeform');
      iconDragState.icon.style.left = left + 'px';
      iconDragState.icon.style.top = top + 'px';
      const layout = loadIconLayout();
      layout[iconDragState.icon.dataset.app] = { left, top };
      saveIconLayout(layout);
    }
    if (iconDragState.ghost) iconDragState.ghost.remove();
    iconDragState.icon.classList.remove('dragging');
    iconDragState = null;
  }
});

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('date-display').textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

function initSpotlight() {
  const appsList = Object.entries(apps).map(([id, a]) => ({ id, title: a.title, icon: a.icon }));
  spotlightInput.addEventListener('input', () => {
    const q = spotlightInput.value.toLowerCase();
    spotlightResults.innerHTML = '';
    appsList.filter(a => a.title.toLowerCase().includes(q)).forEach(a => {
      const item = document.createElement('div');
      item.className = 'spotlight-item';
      item.innerHTML = '<span class="spotlight-icon">' + a.icon + '</span>' + a.title;
      item.onclick = () => { openApp(a.id); closeSpotlight(); };
      spotlightResults.appendChild(item);
    });
    if (!spotlightResults.children.length) {
      spotlightResults.innerHTML = '<div class="spotlight-empty">No apps found</div>';
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); toggleSpotlight(); }
  });
}
function toggleSpotlight() {
  const hidden = spotlightOverlay.classList.toggle('hidden');
  if (!hidden) { spotlightInput.value = ''; spotlightInput.focus(); spotlightInput.dispatchEvent(new Event('input')); }
}
function closeSpotlight() { spotlightOverlay.classList.add('hidden'); }

document.documentElement.style.setProperty('--accent', settingsState.accent);
if (!settingsState.animations) document.documentElement.classList.add('no-anim');
applyGlassSetting();
applyWallpaper();
initSpotlight();
applySavedIconLayout();

if (!isUpgraded) {
  setTimeout(() => showUpgradeNotification('Free plan: max 3 windows. Upgrade for unlimited.'), 5000);
}