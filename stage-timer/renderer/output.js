(() => {
const $ = id => document.getElementById(id);
let st = null, lastP = 0;
function fit() { $('stage').style.setProperty('--s', Math.min(innerWidth / 1920, innerHeight / 1080)); }
addEventListener('resize', fit); fit();
const pad = n => String(n).padStart(2, '0');
const fmt = n => pad(Math.floor(n / 60)) + ':' + pad(n % 60);
const ord = d => (d > 3 && d < 21) ? 'TH' : (['TH', 'ST', 'ND', 'RD'][d % 10] || 'TH');
function dateStr() {   // always the machine's own clock
  const n = new Date(), L = (st && st.lang) || 'en';
  if (L === 'en') {
    let h = n.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${n.getDate()}${ord(n.getDate())} ${n.toLocaleString('en-GB', { month: 'long' })} ${n.getFullYear()} - ${h}:${pad(n.getMinutes())}${ap}`.toUpperCase();
  }
  try { return new Intl.DateTimeFormat(L, { dateStyle: 'long', timeStyle: 'short' }).format(n).toUpperCase(); } catch { return n.toLocaleString(); }
}
function render() {
  if (!st) return;
  const o = st.out || {};
  const bg = o.bg || '#101518';
  document.body.style.background = bg; $('stage').style.background = bg;
  $('bgimg').style.backgroundImage = o.bgImg ? `url(/asset/${o.bgImg}?v=${o.bgV})` : 'none';
  document.body.style.fontFamily = `'${(o.font || 'Poppins').replace(/'/g, '')}', 'Poppins', sans-serif`;
  const lg = $('logo');
  if (o.logo) { lg.className = 'has'; lg.style.backgroundImage = `url(/asset/${o.logo}?v=${o.logoV})`; }
  else { lg.className = ''; lg.style.backgroundImage = 'none'; }
  $('title').textContent = st.title || '';
  $('mod').textContent = st.moderator || '';
  const c = $('clock');
  if (st.done) { c.textContent = 'TIME UP'; c.className = 'up'; }
  else { c.textContent = fmt(st.rem); c.className = st.rem <= 300 ? 'red' : ''; }   // red from 5:00 (300 s) down
  const p = Math.max(0, Math.min(1, st.progress || 0));
  if (p < lastP) { document.body.classList.add('nt'); void document.body.offsetWidth; }
  $('stage').style.setProperty('--p', p);
  if (p < lastP) setTimeout(() => document.body.classList.remove('nt'), 60);
  lastP = p;
  $('date').textContent = dateStr();
}
function connect() {
  const es = new EventSource('/events');
  es.onmessage = e => { try { st = JSON.parse(e.data); render(); } catch {} };
  es.onerror = () => { es.close(); setTimeout(connect, 1500); };
}
connect();
setInterval(() => { if (st) $('date').textContent = dateStr(); }, 1000);
})();
