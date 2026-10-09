const { app, BrowserWindow, ipcMain, screen, dialog, shell, Menu } = require('electron');
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const { API_BASE } = require('./config');
const PORT = 4777;
let win = null, outWin = null, lastState = {}, clients = new Set();

const ud = () => app.getPath('userData');
const settingsFile = () => path.join(ud(), 'settings.json');
const assetsDir = () => { const d = path.join(ud(), 'assets'); fs.mkdirSync(d, { recursive: true }); return d; };
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.ttf':'font/ttf', '.otf':'font/otf',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml' };

function serveFile(res, file) {
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}
function broadcast() { const m = 'data: ' + JSON.stringify(lastState) + '\n\n'; for (const c of clients) c.write(m); }

// Local server: used by the preview, the output window, and OBS / vMix / NDI-capable browser sources (offline, localhost only)
function startServer() {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('data: ' + JSON.stringify(lastState) + '\n\n');
      clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/' || p === '/output.html') return serveFile(res, path.join(__dirname, 'renderer', 'output.html'));
    if (p === '/output.js' || p === '/output.css') return serveFile(res, path.join(__dirname, 'renderer', path.basename(p)));
    if (p.startsWith('/fonts/')) return serveFile(res, path.join(__dirname, 'assets', 'fonts', path.basename(p)));
    if (p.startsWith('/asset/')) return serveFile(res, path.join(assetsDir(), path.basename(p)));
    res.writeHead(404); res.end();
  });
  srv.on('error', e => console.error('Server error', e));
  srv.listen(PORT, '127.0.0.1');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1100, minHeight: 720, backgroundColor: '#121315', title: 'Stage Timer',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; closeOutput(); app.quit(); });
}

function closeOutput() { if (outWin) { const w = outWin; outWin = null; if (!w.isDestroyed()) w.close(); } }
function openOutput(id) {
  closeOutput();
  const all = screen.getAllDisplays(), primary = screen.getPrimaryDisplay();
  const d = all.find(x => String(x.id) === String(id)) || primary;
  const ctrl = win ? screen.getDisplayMatching(win.getBounds()) : primary;
  const full = all.length > 1 && d.id !== ctrl.id;
  const b = d.bounds;
  outWin = new BrowserWindow({
    x: b.x + (full ? 0 : 60), y: b.y + (full ? 0 : 60), width: full ? b.width : 1280, height: full ? b.height : 720,
    fullscreen: full, frame: !full, autoHideMenuBar: true, backgroundColor: '#000000', title: 'Stage Timer Output',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  outWin.setMenuBarVisibility(false);
  outWin.loadURL(`http://127.0.0.1:${PORT}/output.html`);
  outWin.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') closeOutput(); });
  const me = outWin;
  outWin.on('closed', () => { if (outWin === me) outWin = null; if (win && !win.isDestroyed()) win.webContents.send('output:closed'); });
}

const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } };
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, locale: app.getLocale(),
  os: `${process.platform} ${os.release()}`, port: PORT }));
ipcMain.handle('store:get', () => readSettings());
ipcMain.handle('store:set', (_, s) => { try { fs.writeFileSync(settingsFile(), JSON.stringify(s)); return true; } catch { return false; } });
ipcMain.handle('state:push', (_, s) => { lastState = s; broadcast(); return true; });
ipcMain.handle('displays', () => {
  const p = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `${i + 1} · ${d.size.width}×${d.size.height}${d.id === p ? ' ★' : ''}` }));
});
ipcMain.handle('output:open', (_, id) => { openOutput(id); return true; });
ipcMain.handle('output:close', () => { closeOutput(); return true; });
ipcMain.handle('fonts:list', async () => {
  try { return (await require('font-list').getFonts({ disableQuoting: true })).map(f => f.replace(/^"|"$/g, '')); } catch { return []; }
});

function importImage(kind, maxBytes, exts) {
  return async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: exts }] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const f = r.filePaths[0];
    if (fs.statSync(f).size > maxBytes) return { error: 'size' };
    removeAsset(kind);
    const name = kind + path.extname(f).toLowerCase();
    fs.copyFileSync(f, path.join(assetsDir(), name));
    return { file: name, v: Date.now() };
  };
}
function removeAsset(kind) { for (const f of fs.readdirSync(assetsDir())) if (f.startsWith(kind + '.')) fs.unlinkSync(path.join(assetsDir(), f)); }
ipcMain.handle('import:logo', importImage('logo', 1048576, ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif']));   // max 1 MB
ipcMain.handle('import:bg', importImage('bg', 25 * 1048576, ['png', 'jpg', 'jpeg', 'webp']));
ipcMain.handle('asset:remove', (_, kind) => { if (kind === 'logo' || kind === 'bg') removeAsset(kind); return true; });

ipcMain.handle('theme:export', async (_, th) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: (th.name || 'theme') + '.stagetheme.json', filters: [{ name: 'Theme', extensions: ['json'] }] });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, JSON.stringify({ stageTimerTheme: 1, ...th }, null, 2)); return true;
});
ipcMain.handle('theme:import', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Theme', extensions: ['json'] }] });
  if (r.canceled) return null;
  try { return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { return null; }
});

ipcMain.handle('api', async (_, { path: p, body, method }) => {
  if (typeof p !== 'string' || !p.startsWith('/api/')) return { ok: false, error: 'bad' };
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    const m = method || 'POST';
    const r = await fetch(API_BASE + p, { method: m, headers: { 'Content-Type': 'application/json' },
      body: m === 'GET' ? undefined : JSON.stringify(body || {}), signal: ctl.signal });
    clearTimeout(to);
    let data = {}; try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, offline: true }; }
});
ipcMain.handle('open:external', (_, url) => { if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url); return true; });

app.whenReady().then(() => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  startServer(); createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
