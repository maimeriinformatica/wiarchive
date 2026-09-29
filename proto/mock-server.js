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
          news: T.articles.filter((a) => a.status === 'published').sort((a, b) => (a.published_at < b.published_at ? 1 : -1)).slice(0, 4),
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
