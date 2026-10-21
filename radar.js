// WIARCHIVE — Radar notizie
// Raccoglie notizie e video da fonti pubbliche (RSS/Atom, canali video), raggruppa la stessa notizia
// riportata da testate diverse, conta le conferme indipendenti e prepara una sintesi neutra con le fonti citate.
// La pubblicazione può essere manuale (redazione) o automatica sopra una soglia di conferme.
'use strict';
const Parser = require('rss-parser');
const sanitizeHtml = require('sanitize-html');

const UA = 'WIARCHIVE-Radar/1.0 (+aggregatore di notizie con citazione delle fonti)';
const parser = new Parser({
  customFields: { item: [['media:group', 'mediaGroup'], ['media:thumbnail', 'mediaThumb'], ['media:content', 'mediaContent'], ['yt:videoId', 'videoId'], ['dc:date', 'dcDate']] },
});

// Fonti consigliate. mode: link = titolo + estratto + collegamento (testate protette da diritto d'autore)
//                         embed = video tramite il player ufficiale della piattaforma
//                         full  = testo completo ripubblicabile (licenza libera o accordo scritto)
const PRESETS = [
  { name: 'Byoblu', url: 'https://www.byoblu.com/feed/', kind: 'rss', lang: 'it', country: 'IT', owner: 'Byoblu', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', kind: 'rss', lang: 'it', country: 'IT', owner: 'ANSA', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'RaiNews', url: 'https://www.rainews.it/rss/tutti', kind: 'rss', lang: 'it', country: 'IT', owner: 'RAI', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'Il Fatto Quotidiano', url: 'https://www.ilfattoquotidiano.it/feed/', kind: 'rss', lang: 'it', country: 'IT', owner: 'SEIF', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'Avvenire', url: 'https://www.avvenire.it/rss', kind: 'rss', lang: 'it', country: 'IT', owner: 'Avvenire', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'Global Voices in italiano', url: 'https://it.globalvoices.org/feed/', kind: 'rss', lang: 'it', country: 'INT', owner: 'Global Voices', mode: 'full', license: 'CC BY 3.0 — ripubblicabile citando autore e fonte' },
  { name: 'Global Voices', url: 'https://globalvoices.org/feed/', kind: 'rss', lang: 'en', country: 'INT', owner: 'Global Voices', mode: 'full', license: 'CC BY 3.0 — ripubblicabile citando autore e fonte' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', kind: 'rss', lang: 'en', country: 'GB', owner: 'BBC', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'The Guardian — World', url: 'https://www.theguardian.com/world/rss', kind: 'rss', lang: 'en', country: 'GB', owner: 'Guardian Media Group', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'Deutsche Welle', url: 'https://rss.dw.com/rdf/rss-en-all', kind: 'rss', lang: 'en', country: 'DE', owner: 'Deutsche Welle', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'Le Monde — International', url: 'https://www.lemonde.fr/international/rss_full.xml', kind: 'rss', lang: 'fr', country: 'FR', owner: 'Le Monde', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', kind: 'rss', lang: 'es', country: 'ES', owner: 'PRISA', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', kind: 'rss', lang: 'en', country: 'QA', owner: 'Al Jazeera', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', kind: 'rss', lang: 'en', country: 'US', owner: 'NPR', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'ProPublica', url: 'https://www.propublica.org/feeds/propublica/main', kind: 'rss', lang: 'en', country: 'US', owner: 'ProPublica', mode: 'link', license: 'CC BY-NC-ND 3.0 — ripubblicazione integrale solo senza modifiche: qui estratto e collegamento' },
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', kind: 'rss', lang: 'en', country: 'HK', owner: 'Alibaba Group', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'Times of India — World', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', kind: 'rss', lang: 'en', country: 'IN', owner: 'Times Group', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'AllAfrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', kind: 'rss', lang: 'en', country: 'ZA', owner: 'AllAfrica', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'TASS (agenzia statale russa)', url: 'https://tass.com/rss/v2.xml', kind: 'rss', lang: 'en', country: 'RU', owner: 'Stato russo', mode: 'link', license: 'Tutti i diritti riservati — solo estratto e collegamento' },
  { name: 'DW News — video', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCknLrEdhRCp1aegoMqRaCZg', kind: 'youtube', lang: 'en', country: 'DE', owner: 'Deutsche Welle', mode: 'embed', license: 'Incorporamento tramite il player di YouTube' },
  { name: 'Al Jazeera English — video', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNye-wNBqNL5ZzHSJj3l8Bg', kind: 'youtube', lang: 'en', country: 'QA', owner: 'Al Jazeera', mode: 'embed', license: 'Incorporamento tramite il player di YouTube' },
  { name: 'France 24 English — video', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQfwfsi5VrQ8yKZ-UWmAEFg', kind: 'youtube', lang: 'en', country: 'FR', owner: 'France Médias Monde', mode: 'embed', license: 'Incorporamento tramite il player di YouTube' },
];

const COUNTRY = { IT: 'Italia', GB: 'Regno Unito', DE: 'Germania', FR: 'Francia', ES: 'Spagna', US: 'Stati Uniti', QA: 'Qatar', HK: 'Hong Kong', IN: 'India', ZA: 'Sudafrica', RU: 'Russia', INT: 'Internazionale', CN: 'Cina', JP: 'Giappone', BR: 'Brasile', UA: 'Ucraina', IL: 'Israele', TR: 'Turchia', CH: 'Svizzera' };

// ── Testo
const STOP = new Set(`il lo la i gli le un una uno di da in con su per tra fra a e o ma se che non piu più del della dei delle degli al alla ai alle agli dal dalla nel nella nei sul sulla come anche dopo prima oggi ieri sono stato stata essere ha hanno era questo questa quello quella sua suo loro nuovo nuova
the a an of to in on for with at by from and or but is are was were be been has have had it its this that these those as after before over new says said say will would can could not no than into about more most up out who what when where why how amid
le la les un une des du de et en au aux pour par sur dans avec est sont qui que pas plus
el la los las un una unos de del y en por para con es son que no mas más se al lo
der die das ein eine und oder in im auf mit von zu ist sind nicht den dem des für bei nach`.split(/\s+/));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plain = (html, max = 600) => {
  const t = sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t;
};
const stem = (t) => (t.length > 6 ? t.slice(0, 6) : t);
// Profilo di una notizia: entità (nomi propri, numeri, parole chiave) + parole comuni ridotte alla radice
function tokens(title, summary, keys) {
  const text = `${title || ''}. ${String(summary || '').slice(0, 260)}`;
  const ent = new Set(), words = new Set();
  for (const m of text.matchAll(/(^|[^\p{L}])([A-ZÀ-Ý][\p{L}'’-]{2,}|\d{2,})/gu)) { const t = fold(m[2]).replace(/['’].*$/, ''); if (t.length > 2 && !STOP.has(t)) ent.add(t); }
  for (const k of keys || []) for (const t of fold(k).split(/[^a-z0-9]+/)) if (t.length > 2 && !STOP.has(t)) ent.add(t);
  for (const t of fold(text).split(/[^a-z0-9]+/)) if (t.length > 2 && !STOP.has(t)) words.add(stem(t));
  return { ent, words };
}
const overlap = (a, b) => { if (!a.size || !b.size) return { n: 0, r: 0 }; let n = 0; for (const t of a) if (b.has(t)) n++; return { n, r: n / Math.min(a.size, b.size) }; };
// Restituisce un punteggio 0–1; due notizie sono "la stessa" se condividono almeno due entità e superano la soglia
function similarity(a, b, threshold = 0.3) {
  const e = overlap(a.ent, b.ent), w = overlap(a.words, b.words);
  const score = 0.6 * e.r + 0.4 * w.r;
  return (e.n >= 2 && score >= threshold) || score >= threshold + 0.25 ? score : 0;
}

// ── Intelligenza artificiale (facoltativa): parole chiave multilingua e sintesi verificata
const AI_KEY = () => process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
async function aiCall(system, user, maxTokens = 2000) {
  const r = await fetch(`${(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': AI_KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(90000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Servizio AI: errore ${r.status}`);
  return (j.content || []).map((c) => c.text || '').join('');
}
function parseJson(text) {
  const s = String(text || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  const a2 = s.indexOf('['), b2 = s.lastIndexOf(']');
  const useArr = a2 !== -1 && (a === -1 || a2 < a);
  const chunk = useArr ? s.slice(a2, b2 + 1) : s.slice(a, b + 1);
  return JSON.parse(chunk);
}
const SYNTH_SYSTEM = `Sei il caporedattore di verifica di WIARCHIVE, archivio video e testata indipendente.
Ricevi articoli di testate diverse sulla stessa notizia. Il tuo compito è separare i fatti dalle interpretazioni.
Regole:
- Usa SOLO le informazioni presenti negli estratti forniti. Non aggiungere nulla di tuo, nemmeno contesto noto.
- Un fatto è "confermato" solo se riportato da almeno due fonti di proprietari diversi; indica sempre le fonti con i numeri tra parentesi quadre.
- Ciò che compare in una sola fonte va in "da_verificare". Le versioni contrastanti vanno in "divergenze", attribuendo ogni versione alla sua fonte.
- Le dichiarazioni di governi, partiti, eserciti o aziende sono attribuite a chi le fa, non presentate come fatti.
- Tono neutro, frasi brevi, niente aggettivi di giudizio. Scrivi in italiano.
Rispondi solo con JSON: {"titolo": "...", "sommario": "...", "fatti": [{"testo": "...", "fonti": [1,2]}], "divergenze": [{"testo": "...", "fonti": [3]}], "da_verificare": [{"testo": "...", "fonti": [2]}]}`;

function init({ db, adm, getSetting, setSetting, uniqueSlug, nextCode, requireAdmin }) {
  // ── Schema
  db.exec(`
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT UNIQUE NOT NULL, kind TEXT DEFAULT 'rss', lang TEXT, country TEXT, owner TEXT,
    mode TEXT DEFAULT 'link', license TEXT, active INTEGER DEFAULT 1, last_fetch TEXT, last_ok TEXT, last_error TEXT, item_count INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS radar_clusters (
    id INTEGER PRIMARY KEY, title TEXT, first_seen TEXT, last_seen TEXT, items INTEGER DEFAULT 0, owners INTEGER DEFAULT 0, countries INTEGER DEFAULT 0,
    has_video INTEGER DEFAULT 0, score REAL DEFAULT 0, status TEXT DEFAULT 'new', synthesis TEXT, synth_by TEXT, article_id INTEGER, video_id INTEGER);
  CREATE TABLE IF NOT EXISTS radar_items (
    id INTEGER PRIMARY KEY, source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE, guid TEXT NOT NULL, title TEXT, title_it TEXT, url TEXT, summary TEXT, content TEXT,
    image TEXT, video_id TEXT, keys TEXT, published_at TEXT, fetched_at TEXT DEFAULT CURRENT_TIMESTAMP, cluster_id INTEGER REFERENCES radar_clusters(id) ON DELETE SET NULL,
    UNIQUE(source_id, guid));
  CREATE INDEX IF NOT EXISTS radar_items_pub ON radar_items(published_at);
  CREATE INDEX IF NOT EXISTS radar_clusters_seen ON radar_clusters(last_seen);
  `);
  const addCol = (t, c, def) => { if (!db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
  addCol('videos', 'embed_url', 'TEXT'); addCol('videos', 'external_url', 'TEXT'); addCol('videos', 'source_name', 'TEXT');
  addCol('articles', 'origin', 'TEXT'); addCol('articles', 'source_count', 'INTEGER');

  if (!db.prepare('SELECT COUNT(*) c FROM sources').get().c) {
    const ins = db.prepare('INSERT OR IGNORE INTO sources(name,url,kind,lang,country,owner,mode,license) VALUES(@name,@url,@kind,@lang,@country,@owner,@mode,@license)');
    PRESETS.forEach((p) => ins.run(p));
  }
  const defaults = { radar_on: '0', radar_interval: '30', radar_auto: '0', radar_min_owners: '3', radar_settle: '60', radar_max_per_run: '4', radar_window_h: '72', radar_threshold: '0.30', radar_last_run: '', radar_last_report: '' };
  for (const [k, v] of Object.entries(defaults)) if (getSetting(k, null) === null) setSetting(k, v);

  const nowS = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ago = (h) => new Date(Date.now() - h * 3600000).toISOString().replace('T', ' ').slice(0, 19);
  const toS = (d) => { const t = d ? new Date(d) : null; return t && !isNaN(t) ? t.toISOString().replace('T', ' ').slice(0, 19) : nowS(); };

  // ── Lettura di una fonte
  async function fetchSource(src) {
    const res = await fetch(src.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    if (!res.ok) throw new Error(`La fonte risponde ${res.status}`);
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    const out = [];
    for (const it of (feed.items || []).slice(0, 60)) {
      const guid = String(it.guid || it.id || it.link || it.title || '').slice(0, 500);
      if (!guid || !it.title) continue;
      const vid = it.videoId || (String(it.link || '').match(/[?&]v=([\w-]{11})/) || [])[1] || null;
      const mg = it.mediaGroup || {};
      const mgDesc = mg['media:description'] ? [].concat(mg['media:description'])[0] : '';
      const img = it.enclosure?.url && /image/.test(it.enclosure.type || 'image') ? it.enclosure.url
        : it.mediaThumb?.$?.url || it.mediaContent?.$?.url || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null);
      const rawContent = it['content:encoded'] || it.content || '';
      out.push({
        guid, title: plain(it.title, 300), url: it.link || null,
        summary: plain(it.contentSnippet || it.summary || (typeof mgDesc === 'string' ? mgDesc : mgDesc?._) || rawContent, 500),
        content: src.mode === 'full' ? sanitizeHtml(rawContent, {
          allowedTags: ['p', 'a', 'b', 'strong', 'i', 'em', 'blockquote', 'ul', 'ol', 'li', 'br', 'h3', 'h4', 'figure', 'figcaption', 'img'],
          allowedAttributes: { a: ['href'], img: ['src', 'alt'] }, allowedSchemes: ['http', 'https'],
          transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener nofollow' }) },
        }) : null,
        image: img && /^https?:/.test(img) ? img : null, video_id: src.mode === 'embed' ? vid : null,
        published_at: toS(it.isoDate || it.pubDate || it.dcDate),
      });
    }
    return out;
  }

  // ── Parole chiave in inglese (per confrontare notizie scritte in lingue diverse)
  async function aiKeywords(items) {
    if (!AI_KEY() || !items.length) return;
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      try {
        const txt = await aiCall('Estrai dati per confrontare notizie in lingue diverse. Rispondi solo con JSON.',
          `Per ogni notizia restituisci: id, titolo tradotto in italiano, 4-8 parole chiave in inglese minuscolo (nomi di persone, luoghi, organizzazioni, evento). Formato: [{"id":1,"title_it":"...","keys":["..."]}]\n\n` +
          batch.map((x) => `id ${x.id}: ${x.title} — ${String(x.summary || '').slice(0, 200)}`).join('\n'), 3000);
        const arr = parseJson(txt);
        const up = db.prepare('UPDATE radar_items SET title_it=?, keys=? WHERE id=?');
        for (const r of arr) if (r && r.id) up.run(String(r.title_it || '').slice(0, 300) || null, JSON.stringify((r.keys || []).slice(0, 10)), r.id);
      } catch (e) { console.warn('[Radar] parole chiave non disponibili:', e.message); return; }
    }
  }

  // ── Raggruppamento della stessa notizia tra fonti diverse
  function clusterPending() {
    const windowH = Number(getSetting('radar_window_h', '72')) || 72;
    const threshold = Number(getSetting('radar_threshold', '0.30')) || 0.3;
    const pending = db.prepare(`SELECT i.*, s.owner, s.country FROM radar_items i JOIN sources s ON s.id=i.source_id WHERE i.cluster_id IS NULL AND i.published_at>=? ORDER BY i.published_at`).all(ago(windowH));
    if (!pending.length) return 0;
    const recent = db.prepare(`SELECT i.id,i.title,i.title_it,i.summary,i.keys,i.cluster_id FROM radar_items i WHERE i.cluster_id IS NOT NULL AND i.published_at>=?`).all(ago(windowH));
    const pool = recent.map((r) => ({ cid: r.cluster_id, tok: tokens(r.title_it || r.title, r.summary, r.keys ? JSON.parse(r.keys) : []) }));
    const setC = db.prepare('UPDATE radar_items SET cluster_id=? WHERE id=?');
    const newC = db.prepare('INSERT INTO radar_clusters(title,first_seen,last_seen) VALUES(?,?,?)');
    const touched = new Set();
    db.transaction(() => {
      for (const it of pending) {
        const tok = tokens(it.title_it || it.title, it.summary, it.keys ? JSON.parse(it.keys) : []);
        let best = null, bestS = 0;
        for (const p of pool) { const s = similarity(tok, p.tok, threshold); if (s > bestS) { bestS = s; best = p.cid; } }
        let cid = best;
        if (!best || !bestS) cid = newC.run(it.title_it || it.title, it.published_at, it.published_at).lastInsertRowid;
        setC.run(cid, it.id); pool.push({ cid, tok }); touched.add(cid);
      }
    })();
    for (const cid of touched) refreshCluster(cid);
    return touched.size;
  }

  function refreshCluster(cid) {
    const rows = db.prepare(`SELECT i.*, s.owner, s.country, s.lang FROM radar_items i JOIN sources s ON s.id=i.source_id WHERE i.cluster_id=? ORDER BY i.published_at`).all(cid);
    if (!rows.length) { db.prepare('DELETE FROM radar_clusters WHERE id=?').run(cid); return; }
    const owners = new Set(rows.map((r) => r.owner || r.source_id)).size;
    const countries = new Set(rows.map((r) => r.country || '?')).size;
    const hasVideo = rows.some((r) => r.video_id) ? 1 : 0;
    const last = rows[rows.length - 1].published_at;
    const ageH = (Date.now() - new Date(last.replace(' ', 'T') + 'Z')) / 3600000;
    const score = owners * 10 + countries * 6 + hasVideo * 3 - Math.min(ageH, 72) * 0.25;
    const it = rows.find((r) => r.lang === 'it') || rows[0];
    db.prepare('UPDATE radar_clusters SET title=?, first_seen=?, last_seen=?, items=?, owners=?, countries=?, has_video=?, score=? WHERE id=?')
      .run(it.title_it || it.title, rows[0].published_at, last, rows.length, owners, countries, hasVideo, Math.round(score * 10) / 10, cid);
  }

  // ── Sintesi: con AI (fatti confermati / divergenze / da verificare) o, senza AI, rassegna delle fonti
  function clusterItems(cid) {
    return db.prepare(`SELECT i.*, s.name source_name, s.owner, s.country, s.mode, s.license FROM radar_items i JOIN sources s ON s.id=i.source_id WHERE i.cluster_id=? ORDER BY i.published_at`).all(cid);
  }
  async function synthesize(cid) {
    const items = clusterItems(cid);
    if (!items.length) throw new Error('Notizia non trovata');
    let syn, by;
    if (AI_KEY()) {
      const list = items.map((x, i) => `[${i + 1}] ${x.source_name} (${COUNTRY[x.country] || x.country}, proprietà: ${x.owner}) — ${x.published_at}\nTitolo: ${x.title}\nEstratto: ${String(x.content ? plain(x.content, 2500) : x.summary || '')}`).join('\n\n');
      syn = parseJson(await aiCall(SYNTH_SYSTEM, list, 2500)); by = 'ai';
    } else {
      const it = items.find((x) => x.mode === 'full' || /^it/.test(x.lang || '')) || items[0];
      syn = {
        titolo: it.title_it || it.title, sommario: it.summary || '',
        fatti: [], divergenze: [], da_verificare: [],
        rassegna: items.map((x, i) => ({ n: i + 1, testo: `${x.title}${x.summary ? ' — ' + plain(x.summary, 240) : ''}` })),
      };
      by = 'rassegna';
    }
    db.prepare('UPDATE radar_clusters SET synthesis=?, synth_by=? WHERE id=?').run(JSON.stringify(syn), by, cid);
    return { synthesis: syn, by };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function articleBody(syn, by, items) {
    const refs = (arr) => (arr || []).filter((n) => items[n - 1]).map((n) => `<a href="${esc(items[n - 1].url)}" target="_blank" rel="noopener nofollow">[${n}]</a>`).join(' ');
    const list = (title, arr) => arr && arr.length ? `<h3>${title}</h3><ul>${arr.map((f) => `<li>${esc(f.testo)} ${refs(f.fonti)}</li>`).join('')}</ul>` : '';
    let html = '';
    if (by === 'ai') {
      html += list('Fatti confermati da più fonti', syn.fatti) + list('Versioni divergenti', syn.divergenze) + list('Riportato da una sola fonte — da verificare', syn.da_verificare);
    } else {
      html += `<p>Questa notizia è riportata da ${new Set(items.map((x) => x.owner)).size} testate indipendenti. Di seguito come la raccontano, con il collegamento all’originale.</p>`;
      html += `<ul>${(syn.rassegna || []).map((r) => `<li>${esc(r.testo)} ${refs([r.n])}</li>`).join('')}</ul>`;
    }
    const full = items.find((x) => x.mode === 'full' && x.content);
    if (full) html += `<h3>Il testo di ${esc(full.source_name)}</h3>${full.content}<p><i>Testo di ${esc(full.source_name)} — ${esc(full.license || '')}. <a href="${esc(full.url)}" target="_blank" rel="noopener">Originale</a>.</i></p>`;
    html += `<h3>Le fonti</h3><ol>${items.map((x) => `<li><b>${esc(x.source_name)}</b> (${esc(COUNTRY[x.country] || x.country || '')}) — <a href="${esc(x.url)}" target="_blank" rel="noopener nofollow">${esc(x.title)}</a></li>`).join('')}</ol>`;
    html += `<p><i>Scheda compilata dal Radar di WIARCHIVE confrontando testate di proprietà e Paesi diversi${by === 'ai' ? ' con l’aiuto di un sistema di intelligenza artificiale istruito a non aggiungere informazioni proprie' : ''}. Segnala errori alla redazione.</i></p>`;
    return html;
  }

  async function publish(cid, { by = 'redazione' } = {}) {
    const c = db.prepare('SELECT * FROM radar_clusters WHERE id=?').get(cid);
    if (!c) throw new Error('Notizia non trovata');
    if (c.article_id) return { article_id: c.article_id, video_id: c.video_id };
    let syn = c.synthesis ? JSON.parse(c.synthesis) : null, sb = c.synth_by;
    if (!syn) ({ synthesis: syn, by: sb } = await synthesize(cid));
    const items = clusterItems(cid);
    const catId = Number(getSetting('radar_category', '')) || (db.prepare(`SELECT id FROM categories WHERE slug='attualita'`).get() || {}).id || null;
    const now = nowS();
    let videoId = null;
    const v = items.find((x) => x.video_id);
    if (v) {
      videoId = db.prepare(`INSERT INTO videos(code,title,slug,summary,description,category_id,status,published_at,embed_url,external_url,source_name,thumb,tags)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(nextCode(), v.title_it || v.title, uniqueSlug('videos', v.title_it || v.title), v.summary, `${v.summary || ''}\n\nVideo di ${v.source_name}, incorporato dal canale ufficiale.`,
        catId, 'published', now, `https://www.youtube-nocookie.com/embed/${v.video_id}`, v.url, v.source_name, v.image, 'radar').lastInsertRowid;
    }
    const title = String(syn.titolo || c.title).slice(0, 200);
    const articleId = db.prepare(`INSERT INTO articles(title,slug,kicker,summary,body,author,category_id,video_id,status,published_at,origin,source_count)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(title, uniqueSlug('articles', title), `Dal mondo · ${c.owners} fonti`, syn.sommario || '', articleBody(syn, sb, items),
      by === 'auto' ? 'Radar WIARCHIVE' : 'Redazione WIARCHIVE', catId, videoId, 'published', now, 'radar', c.owners).lastInsertRowid;
    db.prepare(`UPDATE radar_clusters SET status='published', article_id=?, video_id=? WHERE id=?`).run(articleId, videoId, cid);
    return { article_id: articleId, video_id: videoId };
  }

  // ── Giro completo
  let running = false;
  async function runOnce() {
    if (running) return { busy: true };
    running = true;
    const t0 = Date.now(), report = { sources: 0, ok: 0, errors: 0, new_items: 0, clusters: 0, published: 0 };
    try {
      const srcs = db.prepare('SELECT * FROM sources WHERE active=1').all();
      report.sources = srcs.length;
      const ins = db.prepare('INSERT OR IGNORE INTO radar_items(source_id,guid,title,url,summary,content,image,video_id,published_at) VALUES(?,?,?,?,?,?,?,?,?)');
      const fresh = [];
      for (let i = 0; i < srcs.length; i += 4) {
        await Promise.all(srcs.slice(i, i + 4).map(async (s) => {
          try {
            const items = await fetchSource(s);
            let n = 0;
            for (const it of items) { const r = ins.run(s.id, it.guid, it.title, it.url, it.summary, it.content, it.image, it.video_id, it.published_at); if (r.changes) { n++; fresh.push({ id: r.lastInsertRowid, title: it.title, summary: it.summary, lang: s.lang }); } }
            db.prepare('UPDATE sources SET last_fetch=?, last_ok=?, last_error=NULL, item_count=item_count+? WHERE id=?').run(nowS(), nowS(), n, s.id);
            report.ok++; report.new_items += n;
          } catch (e) {
            db.prepare('UPDATE sources SET last_fetch=?, last_error=? WHERE id=?').run(nowS(), String(e.cause?.code || e.message).slice(0, 200), s.id);
            report.errors++;
          }
        }));
      }
      await aiKeywords(fresh.filter((x) => x.lang !== 'it'));
      report.clusters = clusterPending();
      if (getSetting('radar_auto') === '1') {
        const minO = Number(getSetting('radar_min_owners', '3')) || 3;
        const settle = Number(getSetting('radar_settle', '60')) || 0;
        const maxN = Number(getSetting('radar_max_per_run', '4')) || 4;
        const cands = db.prepare(`SELECT id FROM radar_clusters WHERE status='new' AND owners>=? AND first_seen<=? AND last_seen>=? ORDER BY score DESC LIMIT ?`)
          .all(minO, new Date(Date.now() - settle * 60000).toISOString().replace('T', ' ').slice(0, 19), ago(24), maxN);
        for (const c of cands) { try { await publish(c.id, { by: 'auto' }); report.published++; } catch (e) { console.warn('[Radar] pubblicazione non riuscita:', e.message); } }
      }
      // pulizia: elementi non pubblicati più vecchi di 30 giorni
      db.prepare(`DELETE FROM radar_items WHERE fetched_at<? AND cluster_id IN (SELECT id FROM radar_clusters WHERE status!='published')`).run(ago(24 * 30));
      db.prepare(`DELETE FROM radar_clusters WHERE status!='published' AND id NOT IN (SELECT DISTINCT cluster_id FROM radar_items WHERE cluster_id IS NOT NULL)`).run();
    } finally {
      running = false;
      report.seconds = Math.round((Date.now() - t0) / 100) / 10;
      setSetting('radar_last_run', nowS()); setSetting('radar_last_report', JSON.stringify(report));
    }
    return report;
  }

  // Pianificazione: controlla ogni minuto se è ora di un nuovo giro
  const timer = setInterval(() => {
    if (getSetting('radar_on') !== '1' || running) return;
    const last = getSetting('radar_last_run'); const every = Math.max(10, Number(getSetting('radar_interval', '30')) || 30);
    if (!last || Date.now() - new Date(last.replace(' ', 'T') + 'Z') >= every * 60000) runOnce().catch((e) => console.error('[Radar]', e));
  }, 60000);
  timer.unref();

  // ── API redazione
  const wrapA = (fn) => async (req, res) => { try { res.json(await fn(req, res)); } catch (e) { console.error(e); res.status(400).json({ error: e.message }); } };
  adm.get('/radar/status', wrapA(() => ({
    on: getSetting('radar_on') === '1', running, ai: !!AI_KEY(), model: AI_KEY() ? AI_MODEL() : null,
    settings: Object.fromEntries(['radar_on', 'radar_interval', 'radar_auto', 'radar_min_owners', 'radar_settle', 'radar_max_per_run', 'radar_window_h', 'radar_threshold', 'radar_category'].map((k) => [k, getSetting(k)])),
    last_run: getSetting('radar_last_run'), report: JSON.parse(getSetting('radar_last_report') || 'null'),
    counts: db.prepare(`SELECT COUNT(*) items, (SELECT COUNT(*) FROM radar_clusters WHERE status='new') new_clusters, (SELECT COUNT(*) FROM radar_clusters WHERE status='published') published FROM radar_items`).get(),
  })));
  adm.put('/radar/settings', wrapA((req) => {
    for (const [k, v] of Object.entries(req.body || {})) if (/^radar_(on|interval|auto|min_owners|settle|max_per_run|window_h|threshold|category)$/.test(k)) setSetting(k, v);
    return { ok: true };
  }));
  adm.post('/radar/run', wrapA(() => runOnce()));
  adm.get('/radar/clusters', wrapA((req) => {
    const status = ['new', 'published', 'discarded'].includes(req.query.status) ? req.query.status : 'new';
    const minO = Number(req.query.min || 1);
    const list = db.prepare(`SELECT * FROM radar_clusters WHERE status=? AND owners>=? ORDER BY ${status === 'new' ? 'score DESC' : 'last_seen DESC'} LIMIT 80`).all(status, minO);
    const its = db.prepare(`SELECT i.id,i.title,i.title_it,i.url,i.summary,i.image,i.video_id,i.published_at,s.name source_name,s.country,s.owner,s.mode FROM radar_items i JOIN sources s ON s.id=i.source_id WHERE i.cluster_id=? ORDER BY i.published_at`);
    return list.map((c) => ({ ...c, synthesis: c.synthesis ? JSON.parse(c.synthesis) : null, members: its.all(c.id).map((x) => ({ ...x, country_name: COUNTRY[x.country] || x.country })) }));
  }));
  adm.post('/radar/clusters/:id/synthesize', wrapA((req) => synthesize(Number(req.params.id))));
  adm.post('/radar/clusters/:id/publish', wrapA((req) => publish(Number(req.params.id))));
  adm.post('/radar/clusters/:id/discard', wrapA((req) => { db.prepare(`UPDATE radar_clusters SET status='discarded' WHERE id=?`).run(req.params.id); return { ok: true }; }));
  adm.post('/radar/clusters/:id/restore', wrapA((req) => { db.prepare(`UPDATE radar_clusters SET status='new' WHERE id=? AND article_id IS NULL`).run(req.params.id); return { ok: true }; }));

  adm.get('/sources', wrapA(() => db.prepare('SELECT * FROM sources ORDER BY active DESC, country, name').all().map((s) => ({ ...s, country_name: COUNTRY[s.country] || s.country }))));
  const SRC_FIELDS = ['name', 'url', 'kind', 'lang', 'country', 'owner', 'mode', 'license', 'active'];
  const cleanSrc = (b) => {
    const o = Object.fromEntries(SRC_FIELDS.filter((f) => b[f] !== undefined).map((f) => [f, b[f] === '' ? null : b[f]]));
    if (o.url !== undefined && !/^https?:\/\//.test(o.url || '')) throw new Error('Indirizzo del feed non valido: deve iniziare con https://');
    if (o.mode && !['link', 'embed', 'full'].includes(o.mode)) o.mode = 'link';
    if (o.mode === 'full' && !o.license) throw new Error('Per ripubblicare il testo completo indica la licenza o l’accordo con la fonte');
    if (o.active !== undefined) o.active = Number(o.active) ? 1 : 0;
    if (o.country) o.country = String(o.country).toUpperCase().slice(0, 3);
    return o;
  };
  adm.post('/sources', requireAdmin, wrapA((req) => {
    const o = cleanSrc(req.body || {}); if (!o.name || !o.url) throw new Error('Nome e indirizzo sono obbligatori');
    if (!o.owner) o.owner = o.name;
    const k = Object.keys(o);
    return { id: db.prepare(`INSERT INTO sources(${k.join(',')}) VALUES(${k.map((x) => '@' + x).join(',')})`).run(o).lastInsertRowid };
  }));
  adm.put('/sources/:id', requireAdmin, wrapA((req) => {
    const o = cleanSrc(req.body || {}); const k = Object.keys(o);
    if (k.length) db.prepare(`UPDATE sources SET ${k.map((x) => `${x}=@${x}`).join(',')} WHERE id=@id`).run({ ...o, id: req.params.id });
    return { ok: true };
  }));
  adm.delete('/sources/:id', requireAdmin, wrapA((req) => { db.prepare('DELETE FROM sources WHERE id=?').run(req.params.id); return { ok: true }; }));
  adm.post('/sources/:id/test', wrapA(async (req) => {
    const s = db.prepare('SELECT * FROM sources WHERE id=?').get(req.params.id); if (!s) throw new Error('Fonte non trovata');
    try { const items = await fetchSource(s); return { ok: true, count: items.length, sample: items.slice(0, 3).map((x) => x.title) }; }
    catch (e) { return { ok: false, error: String(e.cause?.code || e.message) }; }
  }));
  adm.post('/sources/presets', requireAdmin, wrapA(() => {
    const ins = db.prepare('INSERT OR IGNORE INTO sources(name,url,kind,lang,country,owner,mode,license) VALUES(@name,@url,@kind,@lang,@country,@owner,@mode,@license)');
    let n = 0; PRESETS.forEach((p) => { n += ins.run(p).changes; }); return { added: n };
  }));

  return { runOnce, synthesize, publish, clusterPending, tokens, similarity, PRESETS };
}

module.exports = { init, tokens, similarity, parseJson, PRESETS };
