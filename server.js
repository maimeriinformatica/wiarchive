// WIARCHIVE — piattaforma di divulgazione video
// Express + SQLite (better-sqlite3) + upload video su disco (multer)
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '4096', 10);
for (const d of [DATA_DIR, MEDIA_DIR, THUMB_DIR]) fs.mkdirSync(d, { recursive: true });

// ───────────────────────── Database ─────────────────────────
const db = new Database(path.join(DATA_DIR, 'wiarchive.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, color TEXT DEFAULT '#1F4E8C', position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, host TEXT, schedule TEXT,
  description TEXT, cover TEXT, active INTEGER DEFAULT 1, position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  summary TEXT, description TEXT, file TEXT, mime TEXT, size INTEGER, thumb TEXT, duration INTEGER DEFAULT 0,
  program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  episode TEXT, guests TEXT, tags TEXT, featured INTEGER DEFAULT 0, status TEXT DEFAULT 'draft',
  views INTEGER DEFAULT 0, published_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, kicker TEXT, summary TEXT, body TEXT,
  author TEXT, cover TEXT, category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft', published_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY, day INTEGER NOT NULL, time TEXT NOT NULL, title TEXT NOT NULL, program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS pledges (
  id INTEGER PRIMARY KEY, name TEXT, email TEXT, amount REAL, kind TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY, email TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

const getSetting = (k, d = '') => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v ?? ''));

const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
function uniqueSlug(table, base, id) {
  let s = slugify(base), n = 1;
  while (db.prepare(`SELECT id FROM ${table} WHERE slug=? AND id IS NOT ?`).get(s, id || null)) s = `${slugify(base)}-${++n}`;
  return s;
}
function nextCode() {
  const y = new Date().getFullYear();
  const r = db.prepare(`SELECT code FROM videos WHERE code LIKE ? ORDER BY code DESC LIMIT 1`).get(`WA-${y}-%`);
  const n = r ? parseInt(r.code.split('-')[2], 10) + 1 : 1;
  return `WA-${y}-${String(n).padStart(4, '0')}`;
}

// Primo avvio: amministratore + impostazioni + dati di base
if (!db.prepare('SELECT COUNT(*) c FROM users').get().c) {
  const email = process.env.ADMIN_EMAIL || 'admin@wiarchive.local';
  const pass = process.env.ADMIN_PASSWORD || 'wiarchive2026';
  db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email, 'Amministratore', bcrypt.hashSync(pass, 10), 'admin');
  console.log(`[WIARCHIVE] Creato amministratore ${email}`);
}
if (!db.prepare('SELECT COUNT(*) c FROM settings').get().c) {
  const defaults = {
    site_name: 'WIARCHIVE', tagline: "L'archivio che non dimentica",
    live_on: '0', live_title: 'Diretta WIARCHIVE', live_hls: '', live_note: 'La diretta riprende con il prossimo appuntamento del palinsesto.',
    donate_iban: 'IT00 X000 0000 0000 0000 0000 000', donate_holder: 'WIARCHIVE', donate_paypal: '', donate_text:
      'WIARCHIVE vive grazie ai suoi sostenitori: niente pubblicità invadente, nessun padrone. Ogni contributo finanzia nuove puntate e la conservazione dell’archivio.',
    donate_goal: '25000', donate_raised: '0', contact_email: 'redazione@wiarchive.it',
  };
  for (const [k, v] of Object.entries(defaults)) setSetting(k, v);
}
if (!db.prepare('SELECT COUNT(*) c FROM categories').get().c) {
  const cats = [['Attualità', '#B3261E'], ['Economia', '#1F4E8C'], ['Salute', '#2E7D5B'], ['Storia', '#8A5A12'], ['Cultura', '#6B3FA0'], ['Territorio', '#0E7C86']];
  cats.forEach(([n, c], i) => db.prepare('INSERT INTO categories(name,slug,color,position) VALUES(?,?,?,?)').run(n, slugify(n), c, i));
}

// ───────────────────────── App ─────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieSession({
  name: 'wa_sess', keys: [process.env.SESSION_SECRET || 'cambia-questa-chiave-in-produzione'],
  maxAge: 1000 * 60 * 60 * 12, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
}));

// Media: express.static gestisce le richieste Range (seek nel player)
app.use('/media', express.static(MEDIA_DIR, { acceptRanges: true, maxAge: '7d' }));
app.use('/thumbs', express.static(THUMB_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const requireAuth = (req, res, next) => (req.session && req.session.uid) ? next() : res.status(401).json({ error: 'Accesso richiesto' });
const requireAdmin = (req, res, next) => {
  const u = req.session?.uid && db.prepare('SELECT role FROM users WHERE id=?').get(req.session.uid);
  return u && u.role === 'admin' ? next() : res.status(403).json({ error: 'Solo amministratori' });
};
const wrap = (fn) => (req, res) => { try { fn(req, res); } catch (e) { console.error(e); res.status(400).json({ error: e.message }); } };

// ─── Query helpers
const VIDEO_SELECT = `SELECT v.id,v.code,v.title,v.slug,v.summary,v.thumb,v.duration,v.views,v.published_at,v.featured,v.episode,
  v.program_id,v.category_id,p.name program_name,p.slug program_slug,c.name category_name,c.slug category_slug,c.color category_color
  FROM videos v LEFT JOIN programs p ON p.id=v.program_id LEFT JOIN categories c ON c.id=v.category_id`;
const PUB = `v.status='published' AND (v.published_at IS NULL OR v.published_at<=datetime('now'))`;
const pubVideos = (where = '', params = [], order = 'v.published_at DESC', limit = 24, offset = 0) =>
  db.prepare(`${VIDEO_SELECT} WHERE ${PUB} ${where ? 'AND ' + where : ''} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);

// ───────────────────────── API pubbliche ─────────────────────────
app.get('/api/site', wrap((req, res) => {
  const keys = ['site_name', 'tagline', 'live_on', 'live_title', 'contact_email'];
  const s = Object.fromEntries(keys.map((k) => [k, getSetting(k)]));
  s.categories = db.prepare('SELECT id,name,slug,color FROM categories ORDER BY position,name').all();
  res.json(s);
}));

app.get('/api/home', wrap((req, res) => {
  const featured = pubVideos('v.featured=1', [], 'v.published_at DESC', 1)[0] || pubVideos('', [], 'v.published_at DESC', 1)[0] || null;
  const latest = pubVideos(featured ? 'v.id<>?' : '', featured ? [featured.id] : [], 'v.published_at DESC', 8);
  const popular = pubVideos(`v.published_at>=datetime('now','-60 days')`, [], 'v.views DESC', 6);
  const programs = db.prepare('SELECT id,name,slug,host,schedule,cover FROM programs WHERE active=1 ORDER BY position,name').all();
  const rows = db.prepare('SELECT id,name,slug,color FROM categories ORDER BY position,name').all()
    .map((c) => ({ ...c, videos: pubVideos('v.category_id=?', [c.id], 'v.published_at DESC', 6) })).filter((c) => c.videos.length);
  const news = db.prepare(`SELECT id,title,slug,kicker,summary,author,cover,published_at FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 4`).all();
  res.json({ featured, latest, popular, programs, rows, news, live: { on: getSetting('live_on') === '1', title: getSetting('live_title') } });
}));

app.get('/api/videos', wrap((req, res) => {
  const { q, category, program, sort } = req.query;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const w = [], p = [];
  if (q) { w.push('(v.title LIKE ? OR v.summary LIKE ? OR v.tags LIKE ? OR v.guests LIKE ? OR v.code LIKE ?)'); p.push(...Array(5).fill(`%${q}%`)); }
  if (category) { w.push('c.slug=?'); p.push(category); }
  if (program) { w.push('p.slug=?'); p.push(program); }
  const order = sort === 'views' ? 'v.views DESC' : sort === 'old' ? 'v.published_at ASC' : 'v.published_at DESC';
  res.json({ page, items: pubVideos(w.join(' AND '), p, order, 24, (page - 1) * 24) });
}));

app.get('/api/videos/:slug', wrap((req, res) => {
  const v = db.prepare(`SELECT v.*,p.name program_name,p.slug program_slug,p.host program_host,c.name category_name,c.slug category_slug,c.color category_color
    FROM videos v LEFT JOIN programs p ON p.id=v.program_id LEFT JOIN categories c ON c.id=v.category_id WHERE v.slug=? AND ${PUB}`).get(req.params.slug);
  if (!v) return res.status(404).json({ error: 'Video non trovato' });
  v.src = v.file ? `/media/${v.file}` : null;
  const related = pubVideos('v.id<>? AND (v.program_id=? OR v.category_id=?)', [v.id, v.program_id, v.category_id], 'v.published_at DESC', 8);
  res.json({ video: v, related });
}));

app.post('/api/videos/:id/view', wrap((req, res) => {
  const key = `v${req.params.id}`; req.session.seen = req.session.seen || [];
  if (!req.session.seen.includes(key)) { db.prepare('UPDATE videos SET views=views+1 WHERE id=?').run(req.params.id); req.session.seen = [...req.session.seen.slice(-200), key]; }
  res.json({ ok: true });
}));

app.get('/api/programs', wrap((req, res) => {
  res.json(db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM videos v WHERE v.program_id=p.id AND ${PUB}) episodes FROM programs p WHERE active=1 ORDER BY position,name`).all());
}));
app.get('/api/programs/:slug', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM programs WHERE slug=?').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Programma non trovato' });
  res.json({ program: p, videos: pubVideos('v.program_id=?', [p.id], 'v.published_at DESC', 100) });
}));
app.get('/api/categories/:slug', wrap((req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE slug=?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'Categoria non trovata' });
  res.json({ category: c, videos: pubVideos('v.category_id=?', [c.id], 'v.published_at DESC', 100) });
}));

app.get('/api/articles', wrap((req, res) => {
  res.json(db.prepare(`SELECT a.id,a.title,a.slug,a.kicker,a.summary,a.author,a.cover,a.published_at,c.name category_name,c.color category_color
    FROM articles a LEFT JOIN categories c ON c.id=a.category_id WHERE a.status='published' ORDER BY a.published_at DESC LIMIT 60`).all());
}));
app.get('/api/articles/:slug', wrap((req, res) => {
  const a = db.prepare(`SELECT a.*,c.name category_name,c.color category_color FROM articles a LEFT JOIN categories c ON c.id=a.category_id WHERE a.slug=? AND a.status='published'`).get(req.params.slug);
  if (!a) return res.status(404).json({ error: 'Articolo non trovato' });
  const video = a.video_id ? pubVideos('v.id=?', [a.video_id], 'v.id', 1)[0] : null;
  res.json({ article: a, video });
}));

app.get('/api/live', wrap((req, res) => {
  const sched = db.prepare('SELECT s.*,p.name program_name,p.slug program_slug FROM schedule s LEFT JOIN programs p ON p.id=s.program_id ORDER BY day,time').all();
  res.json({ on: getSetting('live_on') === '1', title: getSetting('live_title'), hls: getSetting('live_hls'), note: getSetting('live_note'), schedule: sched });
}));

app.get('/api/donate', wrap((req, res) => {
  const k = ['donate_iban', 'donate_holder', 'donate_paypal', 'donate_text', 'donate_goal', 'donate_raised'];
  const s = Object.fromEntries(k.map((x) => [x.replace('donate_', ''), getSetting(x)]));
  s.supporters = db.prepare('SELECT COUNT(*) c FROM pledges').get().c;
  res.json(s);
}));
app.post('/api/pledges', wrap((req, res) => {
  const { name, email, amount, kind, message } = req.body || {};
  const amt = Number(amount);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Inserisci un indirizzo email valido');
  if (!(amt >= 1)) throw new Error("L'importo minimo è 1 €");
  db.prepare('INSERT INTO pledges(name,email,amount,kind,message) VALUES(?,?,?,?,?)').run(String(name || '').slice(0, 120), email, amt, kind === 'monthly' ? 'monthly' : 'once', String(message || '').slice(0, 1000));
  res.json({ ok: true });
}));
app.post('/api/subscribe', wrap((req, res) => {
  const { email } = req.body || {};
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Inserisci un indirizzo email valido');
  db.prepare('INSERT OR IGNORE INTO subscribers(email) VALUES(?)').run(email);
  res.json({ ok: true });
}));

// ───────────────────────── Autenticazione ─────────────────────────
app.post('/api/auth/login', wrap((req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) return res.status(401).json({ error: 'Email o password non corretti' });
  req.session.uid = u.id;
  res.json({ id: u.id, email: u.email, name: u.name, role: u.role });
}));
app.post('/api/auth/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
app.get('/api/auth/me', requireAuth, wrap((req, res) => res.json(db.prepare('SELECT id,email,name,role FROM users WHERE id=?').get(req.session.uid))));

// ───────────────────────── Upload ─────────────────────────
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === 'video' ? MEDIA_DIR : THUMB_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase() || ''}`),
});
const upload = multer({
  storage, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = file.fieldname === 'video' ? VIDEO_TYPES.includes(file.mimetype) : IMAGE_TYPES.includes(file.mimetype);
    cb(ok ? null : new Error(`Formato non supportato: ${file.mimetype}`), ok);
  },
}).fields([{ name: 'video', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]);

function run(cmd, args) {
  return new Promise((resolve) => {
    let out = ''; const p = spawn(cmd, args);
    p.stdout.on('data', (d) => (out += d)); p.on('error', () => resolve(null)); p.on('close', (c) => resolve(c === 0 ? out : null));
  });
}
// Se ffmpeg è installato ricava durata e copertina automatiche
async function probeVideo(file) {
  const full = path.join(MEDIA_DIR, file);
  const dur = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full]);
  const duration = dur ? Math.round(parseFloat(dur)) || 0 : 0;
  const thumbName = file.replace(/\.[^.]+$/, '') + '.jpg';
  const at = String(Math.min(Math.max(1, Math.floor(duration * 0.2)), 60));
  const ok = await run('ffmpeg', ['-y', '-ss', at, '-i', full, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '4', path.join(THUMB_DIR, thumbName)]);
  return { duration, thumb: ok !== null && fs.existsSync(path.join(THUMB_DIR, thumbName)) ? thumbName : null };
}
const rmFile = (dir, f) => { if (f) fs.promises.unlink(path.join(dir, f)).catch(() => {}); };

// ───────────────────────── API redazione ─────────────────────────
const adm = express.Router();
adm.use(requireAuth);

adm.get('/stats', wrap((req, res) => {
  const one = (sql) => db.prepare(sql).get().c;
  res.json({
    videos: one('SELECT COUNT(*) c FROM videos'), published: one(`SELECT COUNT(*) c FROM videos WHERE status='published'`),
    views: one('SELECT COALESCE(SUM(views),0) c FROM videos'), articles: one('SELECT COUNT(*) c FROM articles'),
    pledges: one('SELECT COUNT(*) c FROM pledges'), pledged: one('SELECT COALESCE(SUM(amount),0) c FROM pledges'),
    subscribers: one('SELECT COUNT(*) c FROM subscribers'),
    storage_mb: Math.round(fs.readdirSync(MEDIA_DIR).reduce((s, f) => s + fs.statSync(path.join(MEDIA_DIR, f)).size, 0) / 1048576),
    top: db.prepare('SELECT id,code,title,views FROM videos ORDER BY views DESC LIMIT 5').all(),
  });
}));

adm.get('/videos', wrap((req, res) => res.json(db.prepare(`SELECT v.id,v.code,v.title,v.slug,v.status,v.featured,v.views,v.duration,v.thumb,v.file,v.size,v.published_at,
  p.name program_name,c.name category_name FROM videos v LEFT JOIN programs p ON p.id=v.program_id LEFT JOIN categories c ON c.id=v.category_id ORDER BY v.created_at DESC`).all())));
adm.get('/videos/:id', wrap((req, res) => res.json(db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id) || {})));

const VIDEO_FIELDS = ['title', 'summary', 'description', 'program_id', 'category_id', 'episode', 'guests', 'tags', 'featured', 'status', 'published_at'];
function normVideo(b) {
  const o = {};
  for (const f of VIDEO_FIELDS) if (b[f] !== undefined) o[f] = b[f] === '' ? null : b[f];
  if (o.featured !== undefined) o.featured = (o.featured === '1' || o.featured === 1 || o.featured === true || o.featured === 'on') ? 1 : 0;
  if (o.status && !['draft', 'published'].includes(o.status)) o.status = 'draft';
  if (o.published_at) o.published_at = String(o.published_at).replace('T', ' ').slice(0, 19);
  return o;
}

adm.post('/videos', (req, res) => upload(req, res, async (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File oltre ${MAX_UPLOAD_MB} MB` : err.message });
  try {
    const o = normVideo(req.body);
    if (!o.title) throw new Error('Il titolo è obbligatorio');
    const vf = req.files?.video?.[0], tf = req.files?.thumb?.[0];
    let meta = { duration: 0, thumb: null };
    if (vf) meta = await probeVideo(vf.filename);
    if (o.status === 'published' && !o.published_at) o.published_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const r = db.prepare(`INSERT INTO videos(code,title,slug,summary,description,program_id,category_id,episode,guests,tags,featured,status,published_at,file,mime,size,thumb,duration)
      VALUES(@code,@title,@slug,@summary,@description,@program_id,@category_id,@episode,@guests,@tags,@featured,@status,@published_at,@file,@mime,@size,@thumb,@duration)`).run({
      summary: null, description: null, program_id: null, category_id: null, episode: null, guests: null, tags: null, featured: 0, status: 'draft', published_at: null,
      ...o, code: nextCode(), slug: uniqueSlug('videos', o.title), file: vf?.filename || null, mime: vf?.mimetype || null, size: vf?.size || null,
      thumb: tf?.filename || meta.thumb, duration: meta.duration || parseInt(req.body.duration || '0', 10) || 0,
    });
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

adm.put('/videos/:id', (req, res) => upload(req, res, async (err) => {
  if (err) return res.status(400).json({ error: err.message });
  try {
    const cur = db.prepare('SELECT * FROM videos WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Video non trovato' });
    const o = normVideo(req.body);
    if (o.title && o.title !== cur.title) o.slug = uniqueSlug('videos', o.title, cur.id);
    if (o.status === 'published' && !o.published_at && !cur.published_at) o.published_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const vf = req.files?.video?.[0], tf = req.files?.thumb?.[0];
    if (vf) {
      const meta = await probeVideo(vf.filename);
      Object.assign(o, { file: vf.filename, mime: vf.mimetype, size: vf.size, duration: meta.duration });
      rmFile(MEDIA_DIR, cur.file);
      if (!tf && meta.thumb) { o.thumb = meta.thumb; if (cur.thumb !== meta.thumb) rmFile(THUMB_DIR, cur.thumb); }
    }
    if (tf) { o.thumb = tf.filename; rmFile(THUMB_DIR, cur.thumb); }
    const keys = Object.keys(o);
    if (keys.length) db.prepare(`UPDATE videos SET ${keys.map((k) => `${k}=@${k}`).join(',')} WHERE id=@id`).run({ ...o, id: cur.id });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

adm.delete('/videos/:id', wrap((req, res) => {
  const cur = db.prepare('SELECT file,thumb FROM videos WHERE id=?').get(req.params.id);
  if (cur) { rmFile(MEDIA_DIR, cur.file); rmFile(THUMB_DIR, cur.thumb); db.prepare('DELETE FROM videos WHERE id=?').run(req.params.id); }
  res.json({ ok: true });
}));

// CRUD generico per tabelle semplici
function crud(name, table, fields, { slugFrom, admin = false, order = 'id DESC' } = {}) {
  const guard = admin ? [requireAdmin] : [];
  const clean = (b) => Object.fromEntries(fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f] === '' ? null : b[f]]));
  adm.get(`/${name}`, wrap((req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all())));
  adm.post(`/${name}`, ...guard, wrap((req, res) => {
    const o = clean(req.body || {});
    if (slugFrom) { if (!o[slugFrom]) throw new Error('Campo obbligatorio mancante'); o.slug = uniqueSlug(table, o[slugFrom]); }
    if (table === 'articles' && o.status === 'published' && !o.published_at) o.published_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const k = Object.keys(o);
    const r = db.prepare(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map((x) => '@' + x).join(',')})`).run(o);
    res.json({ id: r.lastInsertRowid });
  }));
  adm.put(`/${name}/:id`, ...guard, wrap((req, res) => {
    const o = clean(req.body || {});
    if (slugFrom && o[slugFrom]) o.slug = uniqueSlug(table, o[slugFrom], Number(req.params.id));
    if (table === 'articles' && o.status === 'published' && !o.published_at) {
      const cur = db.prepare('SELECT published_at FROM articles WHERE id=?').get(req.params.id);
      if (!cur?.published_at) o.published_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    }
    const k = Object.keys(o);
    if (k.length) db.prepare(`UPDATE ${table} SET ${k.map((x) => `${x}=@${x}`).join(',')} WHERE id=@id`).run({ ...o, id: req.params.id });
    res.json({ ok: true });
  }));
  adm.delete(`/${name}/:id`, ...guard, wrap((req, res) => { db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id); res.json({ ok: true }); }));
}
crud('programs', 'programs', ['name', 'host', 'schedule', 'description', 'cover', 'active', 'position'], { slugFrom: 'name', order: 'position,name' });
crud('categories', 'categories', ['name', 'color', 'position'], { slugFrom: 'name', order: 'position,name' });
crud('articles', 'articles', ['title', 'kicker', 'summary', 'body', 'author', 'cover', 'category_id', 'video_id', 'status', 'published_at'], { slugFrom: 'title', order: 'created_at DESC' });
crud('schedule', 'schedule', ['day', 'time', 'title', 'program_id'], { order: 'day,time' });
adm.get('/users', requireAdmin, wrap((req, res) => res.json(db.prepare('SELECT id,email,name,role,created_at FROM users ORDER BY id').all())));
adm.delete('/users/:id', requireAdmin, wrap((req, res) => {
  if (Number(req.params.id) === req.session.uid) throw new Error('Non puoi eliminare il tuo stesso account');
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id); res.json({ ok: true });
}));

// Copertine per programmi/articoli
const imgUpload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (r, f, cb) => cb(null, IMAGE_TYPES.includes(f.mimetype)) }).single('thumb');
adm.post('/images', (req, res) => imgUpload(req, res, (err) => {
  if (err || !req.file) return res.status(400).json({ error: err?.message || 'Immagine non valida (JPG, PNG o WebP)' });
  res.json({ file: req.file.filename, url: `/thumbs/${req.file.filename}` });
}));

adm.get('/settings', wrap((req, res) => res.json(Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value])))));
adm.put('/settings', wrap((req, res) => { for (const [k, v] of Object.entries(req.body || {})) if (/^[a-z_]+$/.test(k)) setSetting(k, v); res.json({ ok: true }); }));

adm.get('/pledges', wrap((req, res) => res.json(db.prepare('SELECT * FROM pledges ORDER BY created_at DESC').all())));
adm.get('/subscribers', wrap((req, res) => res.json(db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all())));

adm.post('/users/new', requireAdmin, wrap((req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!email || !password || password.length < 8) throw new Error('Email e password (min. 8 caratteri) obbligatorie');
  db.prepare('INSERT INTO users(email,name,password_hash,role) VALUES(?,?,?,?)').run(email.trim().toLowerCase(), name || '', bcrypt.hashSync(password, 10), role === 'admin' ? 'admin' : 'editor');
  res.json({ ok: true });
}));
adm.post('/me/password', wrap((req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) throw new Error('La password deve avere almeno 8 caratteri');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.session.uid);
  res.json({ ok: true });
}));

app.use('/api/admin', adm);
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Risorsa non trovata' }));
app.get('/{*splat}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) app.listen(PORT, () => console.log(`[WIARCHIVE] in ascolto su http://localhost:${PORT}`));
module.exports = { app, db };
