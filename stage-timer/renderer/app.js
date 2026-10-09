(() => {
'use strict';
const api = window.stage;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const BUNDLED = ['Poppins', 'Montserrat', 'Bebas Neue', 'Outfit', 'Figtree'];
const DEF = {
  lang: null, langOk: false, user: null,
  title: 'Title', moderator: 'Moderator name', minutes: 6, seconds: 0,
  schedule: [], idx: -1, auto: false,
  ui: { mode: 'dark', active: null, themes: [] },
  out: { bg: '#101518', font: 'Poppins', fonts: BUNDLED.slice(), logo: null, logoV: 0, bgImg: null, bgV: 0 }
};
const PRESET = { dark: { bg: '#121315', text: '#FFFFFF', accent: '#FFC107' }, light: { bg: '#F3F4F6', text: '#16181A', accent: '#F5A900' } };
const IDX = {}; KEYS.forEach((k, i) => IDX[k] = i);
let S, info, sysFonts = [], sessionSkip = false;

const t = k => ((STR[S && S.lang] || STR.en)[IDX[k]]) ?? STR.en[IDX[k]] ?? k;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = v => /^#[0-9a-fA-F]{6}$/.test(v);
function merge(d, s) {
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return s === undefined ? d : s;
  const o = {}; for (const k in d) o[k] = merge(d[k], s && s[k]);
  for (const k in (s || {})) if (!(k in o)) o[k] = s[k];
  return o;
}
let saveT; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.invoke('store:set', S), 300); };
const call = (path, body, method = 'POST') => api.invoke('api', { path, body, method });

/* ---------- theme (interface only; never touches the output screen) ---------- */
const curTheme = () => (S.ui.active && S.ui.themes.find(x => x.id === S.ui.active)) || PRESET[S.ui.mode] || PRESET.dark;
function applyTheme(c = curTheme()) {
  const r = document.documentElement.style;
  r.setProperty('--bg', c.bg); r.setProperty('--text', c.text); r.setProperty('--accent', c.accent);
}

/* ---------- language ---------- */
function detectLang() {
  let l = String(info.locale || navigator.language || 'en').toLowerCase().split(/[-_]/)[0];
  l = ({ nb: 'no', nn: 'no', iw: 'he', in: 'id' })[l] || l;
  return LANGS.some(x => x.c === l) ? l : 'en';
}
function setDir() {
  const L = LANGS.find(x => x.c === S.lang) || LANGS[0];
  document.documentElement.lang = L.c; document.documentElement.dir = L.rtl ? 'rtl' : 'ltr';
}
function applyI18n() {
  setDir();
  $$('[data-i]').forEach(e => e.textContent = t(e.dataset.i));
  $$('[data-ip]').forEach(e => e.placeholder = t(e.dataset.ip));
  renderControls(); renderSchedule(); renderBadge(); renderAccount(); renderFonts(); renderThemes();
  $('#ver').textContent = 'v' + info.version; push();
}

/* ---------- modal ---------- */
function modal(html) {
  const ov = document.createElement('div'); ov.className = 'ov'; ov.innerHTML = `<div class="md">${html}</div>`;
  $('#modalRoot').appendChild(ov); return { el: ov, close: () => ov.remove() };
}

/* ---------- timer engine (timestamp based, drift-free) ---------- */
const R = { total: 0, remMs: 0, running: false, endAt: 0, done: false };
let lastSec = -1, autoTO = null;
const curMs = () => R.running ? Math.max(0, R.endAt - Date.now()) : R.remMs;
const curSec = () => Math.ceil(curMs() / 1000);
function setTimer(sec) { clearTimeout(autoTO); R.total = Math.max(0, sec | 0); R.remMs = R.total * 1000; R.running = false; R.done = false; push(); }
function start() { clearTimeout(autoTO); if (R.running) return pause(); if (R.done || R.remMs <= 0) return; R.running = true; R.endAt = Date.now() + R.remMs; push(); }
function pause() { if (!R.running) return; R.remMs = curMs(); R.running = false; push(); }
function resetT() { clearTimeout(autoTO); R.running = false; R.done = false; R.remMs = R.total * 1000; push(); }
function finish() {
  R.running = false; R.remMs = 0; R.done = true;
  if (S.auto && S.idx + 1 < S.schedule.length) autoTO = setTimeout(() => step(1, true), 5000);
}
function adjust(d) {
  const cur = Math.max(0, curMs() + d * 1000);
  if (R.running) R.endAt = Date.now() + cur; else R.remMs = cur;
  R.total = Math.max(0, R.total + d, Math.ceil(cur / 1000)); R.done = false;
  if (R.running && cur <= 0) finish();
  push();
}
function push() {
  lastSec = curSec();
  const rem = curMs();
  api.invoke('state:push', {
    title: S.title, moderator: S.moderator, total: R.total, rem: Math.ceil(rem / 1000),
    progress: R.done ? 1 : (R.total ? 1 - rem / (R.total * 1000) : 0),
    running: R.running, done: R.done, out: S.out, lang: S.lang
  });
  renderControls();
}
setInterval(() => {
  if (!S) return;
  if (R.running && curMs() <= 0) { finish(); push(); return; }
  if (curSec() !== lastSec) push();
}, 200);

function renderControls() {
  $('#bStart').textContent = R.running ? t('pause') : t('start');
  $('#bM').textContent = '−1 ' + t('min'); $('#bP').textContent = '+1 ' + t('min');
  let k = 'ready';
  if (R.done) k = 'time_up'; else if (R.running) k = 'running'; else if (R.remMs > 0 && R.remMs < R.total * 1000) k = 'paused';
  const s = $('#status'); s.textContent = t(k); s.className = R.done ? 'up' : '';
}

/* ---------- schedule ---------- */
const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
function renderSchedule() {
  $('#sched').innerHTML = S.schedule.map((a, i) => `<tr class="${i === S.idx ? 'cur' : ''}">
    <td>${esc(a.start || '–')}</td><td>${esc(a.title)}</td><td>${esc(a.moderator)}</td><td>${mmss(a.min * 60 + a.sec)}</td>
    <td class="acts"><button data-a="load" data-r="${i}">${t('load')}</button><button data-a="start" data-r="${i}">${t('start')}</button>
    <button data-a="up" data-r="${i}">↑</button><button data-a="down" data-r="${i}">↓</button><button data-a="del" data-r="${i}">${t('delete')}</button></td></tr>`).join('');
}
function loadIdx(i, go) {
  const a = S.schedule[i]; if (!a) return;
  S.idx = i; S.title = a.title; S.moderator = a.moderator; S.minutes = a.min; S.seconds = a.sec;
  syncInputs(); setTimer(a.min * 60 + a.sec); if (go) start(); renderSchedule(); save();
}
function step(d, go) { const i = S.idx + d; if (i >= 0 && i < S.schedule.length) loadIdx(i, go); }
function syncInputs() { $('#title').value = S.title; $('#mod').value = S.moderator; $('#mins').value = S.minutes; $('#secs').value = S.seconds; }

/* ---------- auth (sign up / sign in with e-mail verification code) ---------- */
function authForm(box, mode, done) {
  let cur = mode, step = 1; const v = { n: '', e: '' };
  const draw = () => {
    box.innerHTML = `<div class="tabs2"><button data-m="up" class="${cur === 'up' ? 'on' : ''}">${t('sign_up')}</button><button data-m="in" class="${cur === 'in' ? 'on' : ''}">${t('sign_in')}</button></div>
    ${step === 1 ? `${cur === 'up' ? `<label>${t('full_name')}</label><input id="af-n" autocomplete="name" value="${esc(v.n)}">` : ''}
      <label>${t('email')}</label><input id="af-e" type="email" autocomplete="email" value="${esc(v.e)}">`
      : `<p class="small">${t('code_sent')}</p><label>${t('code')}</label><input id="af-c" inputmode="numeric" maxlength="6">`}
    <p class="msg" id="af-m"></p><div class="btns"><button class="btn acc" id="af-go">${step === 1 ? t(cur === 'up' ? 'sign_up' : 'sign_in') : t('verify')}</button></div>`;
    $$('.tabs2 button', box).forEach(b => b.onclick = () => { cur = b.dataset.m; step = 1; draw(); });
    $('#af-go', box).onclick = go;
  };
  const msg = s => $('#af-m', box).textContent = s;
  async function go() {
    if (step === 1) {
      v.e = $('#af-e', box).value.trim().toLowerCase(); if (cur === 'up') v.n = $('#af-n', box).value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.e) || (cur === 'up' && v.n.length < 2)) return msg('✗');
      msg('…');
      const r = await call(cur === 'up' ? '/api/signup' : '/api/signin', { name: v.n, email: v.e, lang: S.lang, os: info.os, version: info.version });
      if (r.offline) return msg(t('online_needed'));
      if (r.ok) { step = 2; return draw(); }
      const e = r.data && r.data.error;
      if (e === 'exists') { cur = 'in'; draw(); return; }
      if (e === 'notfound') { cur = 'up'; draw(); return; }
      msg('✗ ' + (e || r.status));
    } else {
      const r = await call('/api/verify', { email: v.e, code: $('#af-c', box).value.trim() });
      if (r.offline) return msg(t('online_needed'));
      if (!r.ok) return msg('✗ ' + ((r.data && r.data.error) || r.status));
      S.user = { name: r.data.name, email: r.data.email, token: r.data.token }; save(); done();
    }
  }
  draw();
}
function renderBadge() { $('#badge').textContent = S.user ? S.user.name : t('sign_in'); }
function renderAccount() {
  const b = $('#acctBox'); if (!b) return;
  if (S.user) {
    b.innerHTML = `<h2>${t('account')}</h2><p>${t('signed_in_as')}</p><p><b>${esc(S.user.name)}</b><br><span class="small">${esc(S.user.email)}</span></p><div class="btns"><button class="btn" id="so">${t('sign_out')}</button></div>`;
    $('#so').onclick = () => { S.user = null; save(); renderAccount(); renderBadge(); };
  } else authForm(b, 'up', () => { renderAccount(); renderBadge(); });
}

/* ---------- appearance: logo, background ---------- */
function renderLogo() {
  const p = $('#logoPrev');
  if (S.out.logo) { p.innerHTML = ''; p.style.backgroundImage = `url(http://127.0.0.1:${info.port}/asset/${S.out.logo}?v=${S.out.logoV})`; }
  else { p.style.backgroundImage = 'none'; p.innerHTML = '<i></i>'; }
}
function renderBg() { $('#bgC').value = S.out.bg; $('#bgH').value = S.out.bg.toUpperCase(); }

/* ---------- appearance: fonts (max 20) ---------- */
function renderFonts() {
  const q = ($('#fSearch').value || '').toLowerCase(), mine = S.out.fonts;
  $('#fActive').innerHTML = mine.map(f => `<option ${f === S.out.font ? 'selected' : ''}>${esc(f)}</option>`).join('');
  $('#fCount').textContent = `${mine.length}/20`;
  const all = [...new Set([...BUNDLED, ...sysFonts])].sort((a, b) => a.localeCompare(b));
  $('#fList').innerHTML = all.filter(f => f.toLowerCase().includes(q)).map(f =>
    `<div class="fi" data-f="${esc(f)}" style="font-family:'${esc(f)}',Poppins">${esc(f)}${mine.includes(f) ? ' ✓' : ''}</div>`).join('');
  $('#fMine').innerHTML = mine.map(f => `<span class="chip ${f === S.out.font ? 'on' : ''}" data-f="${esc(f)}" style="font-family:'${esc(f)}',Poppins">${esc(f)} <b data-x="${esc(f)}" title="${esc(t('remove'))}">✕</b></span>`).join('');
}
function useFont(f) { S.out.font = f; push(); save(); renderFonts(); }

/* ---------- appearance: interface themes (max 15 saved) ---------- */
function renderThemes() {
  $('#thCount').textContent = `${S.ui.themes.length}/15`;
  $('#thList').innerHTML = S.ui.themes.map(th => `<span class="chip ${S.ui.active === th.id ? 'on' : ''}" data-id="${th.id}"><i style="width:14px;height:14px;border-radius:50%;background:${th.accent};border:2px solid ${th.bg}"></i>${esc(th.name)} <b data-x="${th.id}">✕</b></span>`).join('');
  $('#thDark').style.borderColor = !S.ui.active && S.ui.mode === 'dark' ? 'var(--accent)' : '';
  $('#thLight').style.borderColor = !S.ui.active && S.ui.mode === 'light' ? 'var(--accent)' : '';
  const c = curTheme(); $('#thBg').value = c.bg; $('#thTx').value = c.text; $('#thAc').value = c.accent;
}
const draft = () => ({ bg: $('#thBg').value, text: $('#thTx').value, accent: $('#thAc').value });
function addTheme(th) {
  if (S.ui.themes.length >= 15) return alert(`${t('theme')}: 15 max`);
  if (!hex(th.bg) || !hex(th.text) || !hex(th.accent)) return;
  const n = { id: 't' + Date.now(), name: String(th.name || t('theme')).slice(0, 24), bg: th.bg, text: th.text, accent: th.accent };
  S.ui.themes.push(n); S.ui.active = n.id; applyTheme(); renderThemes(); save();
}

/* ---------- updates ---------- */
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; return 0; };
async function checkUpdates(silent) {
  const box = $('#updMsg'), r = await call('/api/version', null, 'GET');
  if (r.offline) { if (!silent) box.textContent = t('online_needed'); return; }
  if (r.ok && r.data.version && cmp(r.data.version, info.version) > 0) {
    box.innerHTML = `<b>${t('update_available')}: v${esc(r.data.version)}</b><p class="small">${esc(r.data.notes || '')}</p><div class="btns"><button class="btn acc" id="updDl">${t('download')}</button></div>`;
    $('#updDl').onclick = () => api.invoke('open:external', r.data.url);
    $('[data-tab=updates]').classList.add('dot');
  } else if (!silent) box.textContent = t('up_to_date');
}

/* ---------- startup dialogs ---------- */
function langModal() {
  return new Promise(res => {
    const m = modal(`<h2 id="lm-h"></h2><select id="lm-s">${LANGS.map(l => `<option value="${l.c}">${l.n}</option>`).join('')}</select><div class="btns"><button class="btn acc" id="lm-ok"></button></div>`);
    const sel = $('#lm-s', m.el); sel.value = S.lang;
    const upd = () => { S.lang = sel.value; setDir(); $('#lm-h', m.el).textContent = t('choose_language'); $('#lm-ok', m.el).textContent = t('confirm'); };
    sel.onchange = upd; upd();
    $('#lm-ok', m.el).onclick = () => { S.langOk = true; save(); m.close(); res(); };
  });
}
function signupModal() {
  return new Promise(res => {
    const m = modal(`<h2>Stage Timer</h2><div id="mb"></div><div class="btns"><button class="btn" id="mskip">${t('skip')}</button></div>`);
    authForm($('#mb', m.el), 'up', () => { m.close(); renderBadge(); renderAccount(); res(); });
    $('#mskip', m.el).onclick = () => { sessionSkip = true; m.close(); res(); };
  });
}

/* ---------- wiring ---------- */
function bind() {
  $$('#nav button').forEach(b => b.onclick = () => {
    $$('#nav button').forEach(x => x.classList.toggle('on', x === b));
    $$('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'updates') b.classList.remove('dot');
  });
  $('#badge').onclick = () => $('[data-tab=account]').click();
  $('#title').oninput = e => { S.title = e.target.value; push(); save(); };
  $('#mod').oninput = e => { S.moderator = e.target.value; push(); save(); };
  $('#setT').onclick = () => {
    S.minutes = Math.max(0, parseInt($('#mins').value) || 0); S.seconds = Math.min(59, Math.max(0, parseInt($('#secs').value) || 0));
    $('#mins').value = S.minutes; $('#secs').value = S.seconds; setTimer(S.minutes * 60 + S.seconds); save();
  };
  $('#bStart').onclick = start; $('#bReset').onclick = resetT;
  $('#bM').onclick = () => adjust(-60); $('#bP').onclick = () => adjust(60);
  addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); start(); } });

  $('#openOut').onclick = () => api.invoke('output:open', $('#disp').value);
  $('#closeOut').onclick = () => api.invoke('output:close');
  $('#url').textContent = `http://127.0.0.1:${info.port}/output.html`;
  const pv = $('#pv'), f = $('#pvf'); new ResizeObserver(() => f.style.transform = `scale(${pv.clientWidth / 1920})`).observe(pv);

  $('#sAdd').onclick = () => {
    const a = { id: Date.now(), title: $('#sTitle').value.trim() || t('title'), moderator: $('#sMod').value.trim() || t('moderator'),
      start: $('#sStart').value, min: Math.max(0, parseInt($('#sMin').value) || 0), sec: Math.min(59, Math.max(0, parseInt($('#sSec').value) || 0)) };
    S.schedule.push(a); $('#sTitle').value = ''; $('#sMod').value = ''; renderSchedule(); save();
  };
  $('#sched').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.r, A = S.schedule;
    if (b.dataset.a === 'load') loadIdx(i, false);
    else if (b.dataset.a === 'start') loadIdx(i, true);
    else if (b.dataset.a === 'del') { A.splice(i, 1); if (S.idx === i) S.idx = -1; else if (S.idx > i) S.idx--; }
    else if (b.dataset.a === 'up' && i > 0) { [A[i - 1], A[i]] = [A[i], A[i - 1]]; if (S.idx === i) S.idx--; else if (S.idx === i - 1) S.idx++; }
    else if (b.dataset.a === 'down' && i < A.length - 1) { [A[i + 1], A[i]] = [A[i], A[i + 1]]; if (S.idx === i) S.idx++; else if (S.idx === i + 1) S.idx--; }
    renderSchedule(); save();
  };
  $('#bPrev').onclick = () => step(-1, false); $('#bNext').onclick = () => step(1, false); $('#bNextS').onclick = () => step(1, true);
  $('#auto').onchange = e => { S.auto = e.target.checked; save(); };

  $('#logoImp').onclick = async () => {
    const r = await api.invoke('import:logo'); if (r.canceled) return;
    if (r.error) { $('#logoMsg').textContent = `${t('logo')}: ≤ 1 MB`; return; }
    $('#logoMsg').textContent = ''; S.out.logo = r.file; S.out.logoV = r.v; renderLogo(); push(); save();
  };
  $('#logoRm').onclick = async () => { await api.invoke('asset:remove', 'logo'); S.out.logo = null; renderLogo(); push(); save(); };
  const setBg = c => { S.out.bg = c; renderBg(); push(); save(); };
  $('#bgC').oninput = e => setBg(e.target.value);
  $('#bgH').onchange = e => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (hex(v)) setBg(v); else renderBg(); };
  $('#bgReset').onclick = async () => { await api.invoke('asset:remove', 'bg'); S.out.bgImg = null; setBg('#101518'); };
  $('#bgImp').onclick = async () => { const r = await api.invoke('import:bg'); if (r.canceled) return; if (r.error) return alert(t('background') + ': ≤ 25 MB'); S.out.bgImg = r.file; S.out.bgV = r.v; push(); save(); };
  $('#bgRm').onclick = async () => { await api.invoke('asset:remove', 'bg'); S.out.bgImg = null; push(); save(); };

  $('#langSel').innerHTML = LANGS.map(l => `<option value="${l.c}">${l.n}</option>`).join('');
  $('#langSel').onchange = e => { S.lang = e.target.value; S.langOk = true; save(); applyI18n(); };

  $('#fActive').onchange = e => useFont(e.target.value);
  $('#fSearch').oninput = renderFonts;
  $('#fList').onclick = e => {
    const d = e.target.closest('.fi'); if (!d) return; const f = d.dataset.f;
    if (!S.out.fonts.includes(f)) { if (S.out.fonts.length >= 20) return alert(`${t('font')}: 20 max`); S.out.fonts.push(f); }
    useFont(f);
  };
  $('#fMine').onclick = e => {
    const x = e.target.closest('[data-x]');
    if (x) { if (S.out.fonts.length <= 1) return; S.out.fonts = S.out.fonts.filter(f => f !== x.dataset.x); if (S.out.font === x.dataset.x) S.out.font = S.out.fonts[0]; push(); save(); return renderFonts(); }
    const c = e.target.closest('.chip'); if (c) useFont(c.dataset.f);
  };

  $('#thDark').onclick = () => { S.ui.mode = 'dark'; S.ui.active = null; applyTheme(); renderThemes(); save(); };
  $('#thLight').onclick = () => { S.ui.mode = 'light'; S.ui.active = null; applyTheme(); renderThemes(); save(); };
  ['#thBg', '#thTx', '#thAc'].forEach(s => $(s).oninput = () => applyTheme(draft()));   // live preview
  $('#thSave').onclick = () => addTheme({ name: $('#thName').value, ...draft() });
  $('#thList').onclick = e => {
    const x = e.target.closest('[data-x]');
    if (x) { S.ui.themes = S.ui.themes.filter(h => h.id !== x.dataset.x); if (S.ui.active === x.dataset.x) S.ui.active = null; applyTheme(); renderThemes(); return save(); }
    const c = e.target.closest('.chip'); if (c) { S.ui.active = c.dataset.id; applyTheme(); renderThemes(); save(); }
  };
  $('#thExp').onclick = () => api.invoke('theme:export', { name: $('#thName').value || 'theme', ...draft() });
  $('#thImp').onclick = async () => { const th = await api.invoke('theme:import'); if (th && th.stageTimerTheme) addTheme(th); };

  $('#fbSend').onclick = async () => {
    const m = $('#fbMsg').value.trim(), out = $('#fbMsgOut'); if (m.length < 3) return;
    const email = S.user ? S.user.email : $('#fbEmail').value.trim();
    out.textContent = '…';
    const r = await call('/api/feedback', { name: S.user ? S.user.name : '', email, token: S.user && S.user.token, message: m, version: info.version, os: info.os });
    if (r.offline) out.textContent = t('online_needed'); else if (r.ok) { out.textContent = t('thanks'); $('#fbMsg').value = ''; } else out.textContent = '✗ ' + ((r.data && r.data.error) || r.status);
  };
  $('#updChk').onclick = () => { $('#updMsg').textContent = '…'; checkUpdates(false); };
  api.on('output:closed', () => {});
}

async function boot() {
  info = await api.invoke('app:info');
  S = merge(DEF, await api.invoke('store:get'));
  if (!S.lang) S.lang = detectLang();       // default = the PC's system language
  applyTheme(); bind(); syncInputs(); $('#auto').checked = S.auto;
  renderBg(); renderLogo();
  const ds = await api.invoke('displays'); $('#disp').innerHTML = ds.map(d => `<option value="${d.id}">${d.label}</option>`).join('');
  setTimer(S.minutes * 60 + S.seconds);
  if (S.idx >= S.schedule.length) S.idx = -1;
  api.invoke('fonts:list').then(l => { sysFonts = l; renderFonts(); });
  applyI18n();
  $('#langSel').value = S.lang;
  if (!S.langOk) { await langModal(); applyI18n(); $('#langSel').value = S.lang; }   // user confirms or switches
  if (!S.user && !sessionSkip) { await signupModal(); }
  checkUpdates(true);
}
boot();
})();
