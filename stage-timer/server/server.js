require('dotenv').config();
const express = require('express'), nodemailer = require('nodemailer'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const ADMIN = process.env.ADMIN_EMAIL || 'mystagetimer@gmail.com';
const DB = path.join(__dirname, 'data.json');
const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { users: {}, codes: {} }; } };
const store = d => fs.writeFileSync(DB, JSON.stringify(d, null, 2));
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
const FROM = `Stage Timer <${process.env.GMAIL_USER}>`;
const okEmail = e => typeof e === 'string' && e.length < 255 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const clean = (s, n = 200) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

const app = express(); app.set('trust proxy', 1); app.use(express.json({ limit: '50kb' }));
const hits = new Map();   // very small per-IP rate limit
app.use((req, res, next) => {
  const n = Date.now(), a = (hits.get(req.ip) || []).filter(x => n - x < 60000); a.push(n); hits.set(req.ip, a);
  if (a.length > 40) return res.status(429).json({ error: 'rate' }); next();
});

async function sendCode(email, code) {
  await mail.sendMail({ from: FROM, to: email, subject: 'Your Stage Timer verification code',
    text: `Your Stage Timer verification code is ${code}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.` });
}
function newCode(d, email, extra) {
  const code = String(crypto.randomInt(100000, 1000000));
  d.codes[email] = { hash: sha(code), exp: Date.now() + 600000, tries: 0, ...extra }; return code;
}

app.post('/api/signup', async (req, res) => {
  const email = clean(req.body.email).toLowerCase(), name = clean(req.body.name, 100);
  if (!okEmail(email) || name.length < 2) return res.status(400).json({ error: 'invalid' });
  const d = load(); if (d.users[email] && d.users[email].verified) return res.status(409).json({ error: 'exists' });
  const code = newCode(d, email, { signup: { name, lang: clean(req.body.lang, 10), os: clean(req.body.os, 60), version: clean(req.body.version, 20) } });
  store(d);
  try { await sendCode(email, code); res.json({ ok: true }); } catch (e) { console.error(e.message); res.status(502).json({ error: 'mail' }); }
});

app.post('/api/signin', async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  if (!okEmail(email)) return res.status(400).json({ error: 'invalid' });
  const d = load(); if (!d.users[email] || !d.users[email].verified) return res.status(404).json({ error: 'notfound' });
  const code = newCode(d, email, {}); store(d);
  try { await sendCode(email, code); res.json({ ok: true }); } catch (e) { console.error(e.message); res.status(502).json({ error: 'mail' }); }
});

app.post('/api/verify', (req, res) => {
  const email = clean(req.body.email).toLowerCase(), code = clean(req.body.code, 10);
  const d = load(), c = d.codes[email];
  if (!c || c.exp < Date.now() || c.tries >= 5) return res.status(400).json({ error: 'expired' });
  c.tries++;
  if (c.hash !== sha(code)) { store(d); return res.status(400).json({ error: 'wrong' }); }
  let u = d.users[email], first = false;
  if (c.signup) { first = !(u && u.verified); u = d.users[email] = { ...(u || {}), name: c.signup.name, email, lang: c.signup.lang, os: c.signup.os, version: c.signup.version, created: (u && u.created) || new Date().toISOString(), verified: true }; }
  else if (!u) return res.status(404).json({ error: 'notfound' });
  const token = crypto.randomBytes(24).toString('hex');
  u.tokens = [...(u.tokens || []), token].slice(-5); u.lastLogin = new Date().toISOString();
  delete d.codes[email]; store(d);
  if (first) mail.sendMail({ from: FROM, to: ADMIN, subject: `New Stage Timer sign-up: ${u.name}`,   // <<< customer list notification
    text: `New customer\n\nName: ${u.name}\nEmail: ${u.email}\nLanguage: ${u.lang}\nOS: ${u.os}\nApp version: ${u.version}\nDate: ${u.created}\nTotal customers: ${Object.values(d.users).filter(x => x.verified).length}` }).catch(e => console.error('admin mail', e.message));
  res.json({ ok: true, name: u.name, email: u.email, token });
});

app.post('/api/feedback', async (req, res) => {
  const email = clean(req.body.email).toLowerCase(), msg = String(req.body.message || '').trim().slice(0, 4000);
  if (msg.length < 3) return res.status(400).json({ error: 'invalid' });
  const u = load().users[email], verified = !!(u && (u.tokens || []).includes(req.body.token));
  try {
    await mail.sendMail({ from: FROM, to: ADMIN, replyTo: okEmail(email) ? email : undefined, subject: `Stage Timer feedback from ${clean(req.body.name, 60) || email || 'anonymous'}`,
      text: `From: ${clean(req.body.name, 60)} <${email}> ${verified ? '(verified user)' : '(unverified)'}\nVersion: ${clean(req.body.version, 20)}\nOS: ${clean(req.body.os, 60)}\n\n${msg}` });
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(502).json({ error: 'mail' }); }
});

// Push an update: change LATEST_VERSION / DOWNLOAD_URL / RELEASE_NOTES in .env and restart.
app.get('/api/version', (req, res) => res.json({ version: process.env.LATEST_VERSION || '1.0.0', url: process.env.DOWNLOAD_URL || '', notes: process.env.RELEASE_NOTES || '' }));

// Customer list for the admin: /admin/users.csv?key=ADMIN_KEY
app.get('/admin/users.csv', (req, res) => {
  const a = Buffer.from(String(req.query.key || '')), b = Buffer.from(process.env.ADMIN_KEY || '\0');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).end();
  const q = v => '"' + String(v || '').replace(/"/g, '""') + '"';
  const rows = Object.values(load().users).filter(u => u.verified).map(u => [u.name, u.email, u.lang, u.os, u.version, u.created].map(q).join(','));
  res.type('text/csv').send('name,email,language,os,version,created\n' + rows.join('\n'));
});
app.listen(process.env.PORT || 8080, () => console.log('Stage Timer server running'));
