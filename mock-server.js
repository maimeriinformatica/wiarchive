/* WIARCHIVE — server simulato nel browser per la demo divulgabile.
   Intercetta fetch('/api/…') e risponde come server.js, con i dati in memoria.
   Richiede: window.WA_SEED = { tables…, builtAt }, window.WA_CLIP = data URI della clip di anteprima. */
(function () {
  'use strict';
  const SEED = window.WA_SEED;
  const shift = Date.now() - SEED.builtAt; // mantiene "5 min fa", "ieri"… relativi al momento della visita
  const fix = (d) => d ? new Date(new Date(d.replace(' ', 'T') + 'Z').getTime() + shift).toISOString().replace('T', ' ').slice(0, 19) : d;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const T = {
    categories: clone(SEED.categories), programs: clone(SEED.programs), schedule: clone(SEED.schedule),
    videos: clone(SEED.videos).map((v) => ({ ...v, published_at: fix(v.published_at), created_at: fix(v.created_at) })),
    articles: clone(SEED.articles).map((a) => ({ ...a, published_at: fix(a.published_at), created_at: fix(a.created_at) })),
    pledges: [['Giulia R.', 25, 'monthly', 'Continuate così!'], ['Marco B.', 10, 'monthly', ''], ['Anna T.', 50, 'once', 'Per la puntata sul Polesine'], ['Paolo V.', 5, 'monthly', ''], ['Associazione Il Ponte', 100, 'once', 'Sostegno annuale'], ['Luisa F.', 10, 'monthly', 'Grazie per i sottotitoli']]
      .map(([name, amount, kind, message], i) => ({ id: i + 1, name, email: name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') + '@esempio.it', amount, kind, message, created_at: fix(SEED.now.slice(0, 11) + String(9 + i).padStart(2, '0') + ':15:00') })),
    subscribers: ['lettore@esempio.it', 'franca.m@esempio.it', 'circolo.valpolicella@esempio.it', 'g.serra@esempio.it'].map((email, i) => ({ id: i + 1, email, created_at: fix(SEED.now) })),
    users: [{ id: 1, email: 'redazione@wiarchive.it', name: 'Redazione (demo)', role: 'admin', created_at: SEED.now }],
  };
  const S = Object.assign({}, SEED.settings, { live_on: '1', live_title: 'Il Punto della Settimana — in diretta dallo studio' });

  // ── Dati dimostrativi del Radar (testate e luoghi immaginari)
  const RS = { radar_on: '1', radar_interval: '30', radar_auto: '0', radar_min_owners: '3', radar_settle: '60', radar_max_per_run: '4', radar_window_h: '72', radar_threshold: '0.30', radar_category: '' };
  const hAgo = (h) => new Date(Date.now() - h * 3600000).toISOString().replace('T', ' ').slice(0, 19);
  const SRC = [
    ['Gazzetta di Montefiore', 'IT', 'Italia', 'Editoriale Arvo', 'link', 'Tutti i diritti riservati — solo estratto e collegamento'],
    ['Northern Valley Post', 'GB', 'Regno Unito', 'NVP Media', 'link', 'Tutti i diritti riservati — solo estratto e collegamento'],
    ['Canale Nord — video', 'FR', 'Francia', 'Nord Médias', 'embed', 'Incorporamento tramite il player ufficiale'],
    ['Voci Libere', 'CH', 'Svizzera', 'Associazione Voci Libere', 'full', 'CC BY 4.0 — ripubblicabile citando autore e fonte'],
    ['Diario del Sur', 'ES', 'Spagna', 'Grupo Sur', 'link', 'Tutti i diritti riservati — solo estratto e collegamento'],
    ['Agenzia Stampa Est (statale)', 'RU', 'Russia', 'Stato', 'link', 'Tutti i diritti riservati — solo estratto e collegamento'],
  ];
  const R = {
    lastRun: hAgo(0.3), report: { sources: 6, ok: 6, errors: 0, new_items: 23, clusters: 3, published: 0, seconds: 4.2 },
    sources: SRC.map(([name, country, country_name, owner, mode, license], i) => ({ id: i + 1, name, url: `https://esempio-${i + 1}.test/feed`, kind: mode === 'embed' ? 'youtube' : 'rss', country, country_name, owner, mode, license, active: 1, item_count: 40 + i * 7, last_ok: hAgo(0.3), last_error: null })),
    clusters: [],
  };
  const M = (si, title, h, title_it) => ({ source_name: SRC[si][0], country: SRC[si][1], country_name: SRC[si][2], owner: SRC[si][3], mode: SRC[si][4], title, title_it: title_it || title, url: '#/progetto', published_at: hAgo(h) });
  R.clusters = [
    { id: 1, status: 'new', owners: 4, countries: 4, has_video: 1, score: 67, title: 'Montefiore, crolla il ponte sul fiume Arvo: tre feriti', first_seen: hAgo(5), last_seen: hAgo(1),
      members: [M(0, 'Montefiore, crolla il ponte sul fiume Arvo: tre feriti', 5), M(1, 'Bridge collapses in Montefiore, three injured', 4, 'Crolla un ponte a Montefiore, tre feriti'), M(2, 'Montefiore: drone footage of the collapsed bridge', 3, 'Montefiore: le immagini dal drone del ponte crollato'), M(3, 'Ponte crollato, il sindaco accusa la Regione', 1)],
      _syn: { titolo: 'Crollo del ponte sull’Arvo a Montefiore', sommario: 'Il ponte è crollato in mattinata; tre feriti. Sulle responsabilità le versioni divergono.',
        fatti: [{ testo: 'Il ponte sul fiume Arvo a Montefiore è crollato in mattinata.', fonti: [1, 2, 4] }, { testo: 'Tre persone sono rimaste ferite in modo lieve.', fonti: [1, 2] }],
        divergenze: [{ testo: 'Il sindaco attribuisce il crollo ai fondi per la manutenzione bloccati dalla Regione; la Regione smentisce.', fonti: [4] }],
        da_verificare: [{ testo: 'Il ponte era stato chiuso ai mezzi pesanti un mese fa.', fonti: [2] }] } },
    { id: 2, status: 'new', owners: 3, countries: 3, has_video: 0, score: 52, title: 'Freedonia, elezioni con affluenza record', first_seen: hAgo(9), last_seen: hAgo(2),
      members: [M(4, 'Freedonia vota: participación récord del 78%', 9, 'Freedonia al voto: affluenza record del 78%'), M(5, 'Freedonia: observers report irregularities', 6, 'Freedonia: gli osservatori segnalano irregolarità'), M(1, 'Freedonia election: turnout at 78 per cent', 2, 'Elezioni in Freedonia: affluenza al 78%')],
      _syn: { titolo: 'Elezioni in Freedonia, affluenza al 78%', sommario: 'Due testate concordano sul dato di affluenza; una sola fonte, statale, parla di irregolarità.',
        fatti: [{ testo: 'L’affluenza alle elezioni in Freedonia è stata del 78%.', fonti: [1, 3] }], divergenze: [],
        da_verificare: [{ testo: 'Osservatori avrebbero segnalato irregolarità in alcuni seggi.', fonti: [2] }] } },
    { id: 3, status: 'new', owners: 1, countries: 1, has_video: 0, score: 16, title: 'Arvo, nuova centrale idroelettrica in progetto', first_seen: hAgo(3), last_seen: hAgo(3),
      members: [M(0, 'Arvo, nuova centrale idroelettrica in progetto', 3)],
      _syn: { titolo: 'Arvo, progetto per una centrale idroelettrica', sommario: 'Notizia riportata da una sola testata.', fatti: [], divergenze: [], da_verificare: [{ testo: 'È in progetto una centrale idroelettrica sull’Arvo.', fonti: [1] }] } },
  ];
  const BLOB = {}; // id video → URL del file caricato in questa sessione
  let session = null, seen = new Set();

  const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const nextId = (t) => T[t].reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
  const uniqueSlug = (t, base, id) => { let s = slugify(base), n = 1; while (T[t].some((x) => x.slug === s && x.id !== id)) s = `${slugify(base)}-${++n}`; return s; };
  const nextCode = () => {
    const y = new Date().getFullYear();
    const n = T.videos.filter((v) => (v.code || '').startsWith(`WA-${y}-`)).reduce((m, v) => Math.max(m, parseInt(v.code.split('-')[2], 10)), 0) + 1;
    return `WA-${y}-${String(n).padStart(4, '0')}`;
  };
  const byId = (t, id) => T[t].find((x) => String(x.id) === String(id));
  const isPub = (v) => v.status === 'published' && (!v.published_at || v.published_at <= now());
  const deco = (v) => {
    const p = byId('programs', v.program_id) || {}, c = byId('categories', v.category_id) || {};
    return { ...v, program_name: p.name || null, program_slug: p.slug || null, program_host: p.host || null, category_name: c.name || null, category_slug: c.slug || null, category_color: c.color || null };
  };
  const pub = (filter = () => true, sort = 'new', limit = 24) => {
    let l = T.videos.filter(isPub).filter(filter).map(deco);
    if (sort === 'views') l.sort((a, b) => b.views - a.views);
    else if (sort === 'old') l.sort((a, b) => (a.published_at > b.published_at ? 1 : -1));
    else l.sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
    return l.slice(0, limit);
  };
  const cats = () => [...T.categories].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const progs = () => [...T.programs].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const err = (status, msg) => { const e = new Error(msg); e.status = status; throw e; };
  const email = (e) => /^\S+@\S+\.\S+$/.test(e || '');

  // Metadati di un file video caricato: durata e fotogramma di copertina
  function probe(url) {
    return new Promise((resolve) => {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
      const out = { duration: 0, thumb: null };
      const t = setTimeout(() => resolve(out), 6000);
      v.onloadedmetadata = () => { out.duration = Math.round(v.duration) || 0; v.currentTime = Math.min(Math.max(1, v.duration * 0.2), 60); };
      v.onseeked = () => {
        try { const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * (v.videoHeight / v.videoWidth)) || 360; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.thumb = c.toDataURL('image/jpeg', 0.8); } catch (e) {}
        clearTimeout(t); resolve(out);
      };
      v.onerror = () => { clearTimeout(t); resolve(out); };
    });
  }
  const readImage = (f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(f); });

  async function saveVideo(fd, id) {
    const get = (k) => (fd.has(k) ? fd.get(k) : undefined);
    const cur = id ? byId('videos', id) : null;
    if (id && !cur) err(404, 'Video non trovato');
    const o = {};
    for (const k of ['title', 'summary', 'description', 'program_id', 'category_id', 'episode', 'guests', 'tags', 'status', 'published_at']) { const v = get(k); if (v !== undefined) o[k] = v === '' ? null : v; }
    if (get('featured') !== undefined) o.featured = get('featured') === '1' ? 1 : 0;
    if (!id && !o.title) err(400, 'Il titolo è obbligatorio');
    if (o.status === 'published' && !o.published_at && !(cur && cur.published_at)) o.published_at = now();
    const vf = get('video'), tf = get('thumb');
    const rec = cur || { id: nextId('videos'), code: nextCode(), views: 0, created_at: now(), duration: 0, thumb: null, file: null };
    if (vf && vf.size) {
      const url = URL.createObjectURL(vf); const meta = await probe(url);
      BLOB[rec.id] = url; Object.assign(o, { file: vf.name, size: vf.size, mime: vf.type, duration: meta.duration });
      if (meta.thumb) o.thumb = meta.thumb;
    }
    if (tf && tf.size) o.thumb = await readImage(tf);
    if (o.title && o.title !== rec.title) o.slug = uniqueSlug('videos', o.title, rec.id);
    Object.assign(rec, o);
    if (!cur) T.videos.push(rec);
    return { id: rec.id };
  }

  const CRUD = {
    programs: { fields: ['name', 'host', 'schedule', 'description', 'cover', 'active', 'position'], slug: 'name' },
    categories: { fields: ['name', 'color', 'position'], slug: 'name' },
    articles: { fields: ['title', 'kicker', 'summary', 'body', 'author', 'cover', 'category_id', 'video_id', 'status', 'published_at'], slug: 'title' },
    schedule: { fields: ['day', 'time', 'title', 'program_id'] },
  };

  async function handle(method, path, qs, body) {
    // ── pubbliche
    if (method === 'GET') {
      if (path === '/site') return { site_name: S.site_name, tagline: S.tagline, live_on: S.live_on, live_title: S.live_title, contact_email: S.contact_email, categories: cats() };
      if (path === '/home') {
        const f = pub((v) => v.featured, 'new', 1)[0] || pub(() => true, 'new', 1)[0] || null;
        const cut = new Date(Date.now() - 60 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
        return {
          featured: f, latest: pub((v) => !f || v.id !== f.id, 'new', 8), popular: pub((v) => v.published_at >= cut, 'views', 6),
          programs: progs().filter((p) => p.active), rows: cats().map((c) => ({ ...c, videos: pub((v) => v.category_id === c.id, 'new', 6) })).filter((c) => c.videos.length),
          news: T.articles.filter((a) => a.status === 'published' && a.origin !== 'radar').sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).slice(0, 4),
          world: T.articles.filter((a) => a.status === 'published' && a.origin === 'radar').sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).slice(0, 6),
          live: { on: S.live_on === '1', title: S.live_title },
        };
      }
      if (path === '/videos') {
        const q = (qs.get('q') || '').toLowerCase();
        return { page: 1, items: pub((v) => !q || [v.title, v.summary, v.tags, v.guests, v.code].join(' ').toLowerCase().includes(q), qs.get('sort'), 200) };
      }
      let m;
      if ((m = path.match(/^\/videos\/([^/]+)$/))) {
        const v = T.videos.find((x) => x.slug === decodeURIComponent(m[1]) && isPub(x)); if (!v) err(404, 'Video non trovato');
        const d = deco(v); d.src = v.file ? (BLOB[v.id] || window.WA_CLIP) : null;
        return { video: d, related: pub((x) => x.id !== v.id && (x.program_id === v.program_id || x.category_id === v.category_id), 'new', 8) };
      }
      if (path === '/programs') return progs().filter((p) => p.active).map((p) => ({ ...p, episodes: T.videos.filter((v) => v.program_id === p.id && isPub(v)).length }));
      if ((m = path.match(/^\/programs\/([^/]+)$/))) { const p = T.programs.find((x) => x.slug === m[1]); if (!p) err(404, 'Programma non trovato'); return { program: p, videos: pub((v) => v.program_id === p.id, 'new', 100) }; }
      if ((m = path.match(/^\/categories\/([^/]+)$/))) { const c = T.categories.find((x) => x.slug === m[1]); if (!c) err(404, 'Categoria non trovata'); return { category: c, videos: pub((v) => v.category_id === c.id, 'new', 100) }; }
      if (path === '/articles') return T.articles.filter((a) => a.status === 'published').sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).map((a) => { const c = byId('categories', a.category_id) || {}; return { ...a, category_name: c.name, category_color: c.color }; });
      if ((m = path.match(/^\/articles\/([^/]+)$/))) {
        const a = T.articles.find((x) => x.slug === m[1] && x.status === 'published'); if (!a) err(404, 'Articolo non trovato');
        const c = byId('categories', a.category_id) || {};
        return { article: { ...a, category_name: c.name, category_color: c.color }, video: a.video_id ? pub((v) => v.id === Number(a.video_id), 'new', 1)[0] || null : null };
      }
      if (path === '/live') return { on: S.live_on === '1', title: S.live_title, hls: S.live_on === '1' ? window.WA_CLIP : '', note: S.live_note,
        schedule: [...T.schedule].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)).map((s) => { const p = byId('programs', s.program_id) || {}; return { ...s, program_name: p.name, program_slug: p.slug }; }) };
      if (path === '/donate') return { iban: S.donate_iban, holder: S.donate_holder, paypal: S.donate_paypal, text: S.donate_text, goal: S.donate_goal, raised: S.donate_raised, supporters: T.pledges.length };
    }
    if (method === 'POST') {
      let m;
      if ((m = path.match(/^\/videos\/(\d+)\/view$/))) { if (!seen.has(m[1])) { seen.add(m[1]); const v = byId('videos', m[1]); if (v) v.views++; } return { ok: true }; }
      if (path === '/pledges') {
        if (!email(body.email)) err(400, 'Inserisci un indirizzo email valido');
        if (!(Number(body.amount) >= 1)) err(400, "L'importo minimo è 1 €");
        T.pledges.unshift({ id: nextId('pledges'), name: body.name || '', email: body.email, amount: Number(body.amount), kind: body.kind === 'monthly' ? 'monthly' : 'once', message: body.message || '', created_at: now() });
        return { ok: true };
      }
      if (path === '/subscribe') { if (!email(body.email)) err(400, 'Inserisci un indirizzo email valido'); if (!T.subscribers.some((s) => s.email === body.email)) T.subscribers.unshift({ id: nextId('subscribers'), email: body.email, created_at: now() }); return { ok: true }; }
      if (path === '/auth/login') { const u = T.users.find((x) => x.email === String(body.email || '').trim().toLowerCase()); if (!u || body.password !== 'demo') err(401, 'Nella demo usa redazione@wiarchive.it con password “demo”'); session = u.id; return u; }
      if (path === '/auth/logout') { session = null; return { ok: true }; }
    }
    if (path === '/auth/me') { if (!session) err(401, 'Accesso richiesto'); return byId('users', session); }

    // ── redazione
    if (!path.startsWith('/admin/')) err(404, 'Risorsa non trovata');
    if (!session) err(401, 'Accesso richiesto');
    const p = path.slice(6);
    let m;
    if (method === 'GET' && p === '/stats') {
      return { videos: T.videos.length, published: T.videos.filter((v) => v.status === 'published').length, views: T.videos.reduce((s, v) => s + v.views, 0), articles: T.articles.length,
        pledges: T.pledges.length, pledged: T.pledges.reduce((s, x) => s + x.amount, 0), subscribers: T.subscribers.length,
        storage_mb: Math.round(T.videos.reduce((s, v) => s + (v.size || 0), 0) / 1048576), top: [...T.videos].sort((a, b) => b.views - a.views).slice(0, 5) };
    }
    if (p === '/videos' && method === 'GET') return [...T.videos].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id)).map(deco);
    if (p === '/videos' && method === 'POST') return saveVideo(body);
    if ((m = p.match(/^\/videos\/(\d+)$/))) {
      if (method === 'GET') return byId('videos', m[1]) || {};
      if (method === 'PUT') return saveVideo(body, Number(m[1]));
      if (method === 'DELETE') { T.videos = T.videos.filter((v) => String(v.id) !== m[1]); return { ok: true }; }
    }
    if ((m = p.match(/^\/(programs|categories|articles|schedule)(?:\/(\d+))?$/))) {
      const t = m[1], id = m[2] && Number(m[2]), cfg = CRUD[t];
      const clean = (b) => Object.fromEntries(cfg.fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f] === '' ? null : b[f]]));
      const numify = (o) => { for (const k of ['program_id', 'category_id', 'video_id', 'day', 'position', 'active']) if (o[k] != null) o[k] = Number(o[k]); return o; };
      if (method === 'GET' && !id) return t === 'schedule' ? [...T.schedule].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)) : t === 'articles' ? [...T.articles].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) : t === 'programs' ? progs() : cats();
      if (method === 'POST') {
        const o = numify(clean(body));
        if (cfg.slug) { if (!o[cfg.slug]) err(400, 'Campo obbligatorio mancante'); o.slug = uniqueSlug(t, o[cfg.slug]); }
        if (t === 'articles' && o.status === 'published' && !o.published_at) o.published_at = now();
        const rec = { id: nextId(t), created_at: now(), active: 1, position: 0, ...o }; T[t].push(rec); return { id: rec.id };
      }
      const cur = byId(t, id); if (!cur) err(404, 'Elemento non trovato');
      if (method === 'PUT') {
        const o = numify(clean(body));
        if (cfg.slug && o[cfg.slug]) o.slug = uniqueSlug(t, o[cfg.slug], id);
        if (t === 'articles' && o.status === 'published' && !o.published_at && !cur.published_at) o.published_at = now();
        Object.assign(cur, o); return { ok: true };
      }
      if (method === 'DELETE') { T[t] = T[t].filter((x) => x.id !== id); return { ok: true }; }
    }
    // ── Radar (demo con testate e luoghi immaginari)
    if (p === '/radar/status') return { on: RS.radar_on === '1', running: false, ai: true, model: 'demo', settings: { ...RS }, last_run: R.lastRun, report: R.report,
      counts: { items: R.clusters.reduce((n, c) => n + c.members.length, 0), new_clusters: R.clusters.filter((c) => c.status === 'new').length, published: R.clusters.filter((c) => c.status === 'published').length } };
    if (p === '/radar/settings') { Object.assign(RS, body); return { ok: true }; }
    if (p === '/radar/run') { await new Promise((r) => setTimeout(r, 900)); R.lastRun = now(); R.report = { sources: R.sources.length, ok: R.sources.length, errors: 0, new_items: 0, clusters: 0, published: 0, seconds: 0.9 }; return R.report; }
    if (p === '/radar/clusters') { const st = qs.get('status') || 'new', min = Number(qs.get('min') || 1); return R.clusters.filter((c) => c.status === st && c.owners >= min).map(clone); }
    if ((m = p.match(/^\/radar\/clusters\/(\d+)\/(synthesize|publish|discard|restore)$/))) {
      const c = R.clusters.find((x) => x.id === Number(m[1])); if (!c) err(404, 'Notizia non trovata');
      if (m[2] === 'synthesize') { await new Promise((r) => setTimeout(r, 700)); c.synthesis = c._syn; return { synthesis: c.synthesis, by: 'ai' }; }
      if (m[2] === 'discard') { c.status = 'discarded'; return { ok: true }; }
      if (m[2] === 'restore') { c.status = 'new'; return { ok: true }; }
      c.synthesis = c.synthesis || c._syn; const syn = c.synthesis;
      const refs = (a) => (a || []).map((n) => `<a href="#/news">[${n}]</a>`).join(' ');
      const list = (t, a) => a && a.length ? `<h3>${t}</h3><ul>${a.map((f) => `<li>${f.testo} ${refs(f.fonti)}</li>`).join('')}</ul>` : '';
      const body = list('Fatti confermati da più fonti', syn.fatti) + list('Versioni divergenti', syn.divergenze) + list('Riportato da una sola fonte — da verificare', syn.da_verificare)
        + `<h3>Le fonti</h3><ol>${c.members.map((x) => `<li><b>${x.source_name}</b> (${x.country_name}) — ${x.title}</li>`).join('')}</ol><p><i>Scheda dimostrativa: testate e luoghi sono immaginari.</i></p>`;
      const t = syn.titolo, id = nextId('articles');
      T.articles.push({ id, title: t, slug: uniqueSlug('articles', t), kicker: `Dal mondo · ${c.owners} fonti`, summary: syn.sommario, body, author: 'Radar WIARCHIVE', category_id: (T.categories[0] || {}).id, status: 'published', published_at: now(), created_at: now(), origin: 'radar', source_count: c.owners });
      c.status = 'published'; c.article_id = id; return { article_id: id };
    }
    if (p === '/sources' && method === 'GET') return R.sources;
    if (p === '/sources' && method === 'POST') { if (!body.name || !/^https?:\/\//.test(body.url || '')) err(400, 'Nome e indirizzo (https://…) sono obbligatori'); if (body.mode === 'full' && !body.license) err(400, 'Per ripubblicare il testo completo indica la licenza o l’accordo con la fonte');
      R.sources.push({ id: R.sources.length + 1, active: 1, item_count: 0, country_name: body.country, ...body }); return { ok: true }; }
    if ((m = p.match(/^\/sources\/(\d+)(\/test)?$/))) {
      const src = R.sources.find((x) => x.id === Number(m[1])); if (!src) err(404, 'Fonte non trovata');
      if (m[2]) return { ok: true, count: 20, sample: [] };
      if (method === 'DELETE') { R.sources = R.sources.filter((x) => x !== src); return { ok: true }; }
      Object.assign(src, body); return { ok: true };
    }
    if (p === '/sources/presets') return { added: 0 };
    if (p === '/settings') { if (method === 'GET') return { ...S }; Object.assign(S, body); return { ok: true }; }
    if (p === '/pledges') return T.pledges;
    if (p === '/subscribers') return T.subscribers;
    if (p === '/users' && method === 'GET') return T.users;
    if (p === '/users/new') { if (!body.email || !body.password || body.password.length < 8) err(400, 'Email e password (min. 8 caratteri) obbligatorie'); T.users.push({ id: nextId('users'), email: body.email.toLowerCase(), name: body.name || '', role: body.role === 'admin' ? 'admin' : 'editor', created_at: now() }); return { ok: true }; }
    if ((m = p.match(/^\/users\/(\d+)$/)) && method === 'DELETE') { if (Number(m[1]) === session) err(400, 'Non puoi eliminare il tuo stesso account'); T.users = T.users.filter((u) => u.id !== Number(m[1])); return { ok: true }; }
    if (p === '/me/password') { if (!body.password || body.password.length < 8) err(400, 'La password deve avere almeno 8 caratteri'); return { ok: true }; }
    err(404, 'Risorsa non trovata');
  }

  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = async function (input, opts = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api')) return realFetch(input, opts);
    const [path, q] = url.slice(4).split('?');
    let body = opts.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    if (!body) body = {};
    await new Promise((r) => setTimeout(r, 40));
    try {
      const out = await handle((opts.method || 'GET').toUpperCase(), path, new URLSearchParams(q || ''), body);
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      if (!e.status) console.error(e);
      return new Response(JSON.stringify({ error: e.message }), { status: e.status || 500, headers: { 'Content-Type': 'application/json' } });
    }
  };
  window.WA_DEMO = true;
})();
