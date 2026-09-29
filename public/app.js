/* WIARCHIVE — frontend pubblico (SPA senza dipendenze) */
(function () {
  'use strict';
  const API = window.WA_API || {
    async get(u) { const r = await fetch('/api' + u); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Errore di rete'); return j; },
    async post(u, body) { const r = await fetch('/api' + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Errore di rete'); return j; },
    media: (v) => v.src,
    thumb: (f) => (/^(data|blob|https?):/.test(f) ? f : '/thumbs/' + f),
  };
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const DAYS_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  let SITE = { categories: [] };

  // ── Formattazione
  const dur = (s) => { s = s | 0; const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const views = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mln' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + 'k' : String(n || 0);
  const parseD = (d) => d ? new Date(String(d).replace(' ', 'T') + (String(d).includes('Z') ? '' : 'Z')) : null;
  const ago = (d) => {
    const t = parseD(d); if (!t) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 3600) return Math.max(1, (s / 60) | 0) + ' min fa';
    if (s < 86400) return ((s / 3600) | 0) + ' ore fa';
    if (s < 86400 * 2) return 'ieri';
    if (s < 86400 * 30) return ((s / 86400) | 0) + ' giorni fa';
    return t.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const fullDate = (d) => { const t = parseD(d); return t ? t.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  const euro = (n) => Number(n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  // ── Componenti
  function thumb(v, big) {
    const color = v.category_color || '#1F4E8C';
    const img = v.thumb ? `<img src="${esc(API.thumb(v.thumb))}" alt="" loading="lazy">` : `
      <div class="poster" style="background:linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 45%, #050A14))">
        <span class="pn">${esc(v.program_name || v.category_name || 'WIARCHIVE')}</span>
        <span class="pc">${esc(v.code || '')}${v.episode ? ' · ' + esc(v.episode) : ''}</span>
        <span class="big" aria-hidden="true">${esc((v.program_name || 'W').slice(0, 1))}</span>
      </div>`;
    return `<div class="thumb">${img}${v.duration ? `<span class="dur">${dur(v.duration)}</span>` : ''}${big ? '' : '<span class="play-ico"></span>'}</div>`;
  }
  const chip = (v) => v.category_name ? `<span class="chip" style="color:${esc(v.category_color)}"><i style="background:${esc(v.category_color)}"></i>${esc(v.category_name)}</span>` : '';
  const card = (v) => `<a class="card" href="#/video/${esc(v.slug)}">${thumb(v)}
    <div class="meta">${chip(v)}<span class="code">${esc(v.code || '')}</span></div>
    <h3 class="t">${esc(v.title)}</h3>
    <div class="meta">${v.program_name ? `<span class="prog">${esc(v.program_name)}</span>` : ''}<span>${views(v.views)} visual.</span><span>${ago(v.published_at)}</span></div></a>`;
  const grid = (list) => list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty">Nessun video in archivio per questa selezione.</div>`;
  const secHead = (title, more, sw, sub) => `<div class="sec-head">${sw ? `<span class="sw" style="background:${esc(sw)}"></span>` : ''}<h2>${esc(title)}</h2>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${more ? `<a class="more" href="${more}">Vedi tutto →</a>` : ''}</div>`;
  const progCard = (p, i) => {
    const colors = ['#E0312B', '#B7791A', '#1F7A8C', '#6C8FF0', '#2E7D5B', '#8E5AD8'];
    return `<a class="prog-card" href="#/programma/${esc(p.slug)}"><span class="stripe" style="background:${colors[i % colors.length]}"></span>
      <div class="top"><span class="eyebrow" style="color:#7F8DA3">Programma</span><div class="name">${esc(p.name)}</div><div class="host">con ${esc(p.host || 'la redazione')}</div></div>
      <div class="foot"><span>${esc(p.schedule || '')}</span><span>${p.episodes != null ? p.episodes + ' puntate' : 'Guarda →'}</span></div></a>`;
  };
  const newsItem = (a) => `<a class="news-item" href="#/news/${esc(a.slug)}"><span class="k">${esc(a.kicker || 'Notizie')}</span><h3>${esc(a.title)}</h3><p>${esc(a.summary || '')}</p>
    <div class="meta"><span>${esc(a.author || 'Redazione')}</span><span>${ago(a.published_at)}</span></div></a>`;
  const supportBand = () => `<section class="section"><div class="support-band"><div><h3>Un archivio libero ha bisogno di te</h3>
    <p>WIARCHIVE si regge sui contributi di chi lo guarda. Con un piccolo sostegno mensile finanzi nuove puntate e la conservazione di tutto l’archivio.</p></div>
    <a class="btn amber" href="#/sostienici">Sostieni WIARCHIVE</a></div></section>`;

  // ── Pagine
  const pages = {
    async home() {
      const h = await API.get('/home');
      const f = h.featured;
      const side = h.latest.slice(0, 4);
      return `
      ${f ? `<section class="section hero">
        <a class="hero-main" href="#/video/${esc(f.slug)}">${thumb(f, true)}
          <div class="cap"><div class="meta">${chip(f)}<span class="code">${esc(f.code)}</span><span>${esc(f.program_name || '')}</span></div>
          <h1>${esc(f.title)}</h1><p>${esc(f.summary || '')}</p></div></a>
        <div class="hero-side"><h3>Appena pubblicati</h3>${side.map((v) => `<a class="mini" href="#/video/${esc(v.slug)}">${thumb(v)}<div><div class="t">${esc(v.title)}</div><div class="meta"><span>${ago(v.published_at)}</span></div></div></a>`).join('')}</div>
      </section>` : '<div class="empty">L’archivio è ancora vuoto: carica il primo video dalla redazione.</div>'}
      ${h.live && h.live.on ? `<section class="section"><a class="support-band" href="#/diretta" style="background:var(--onair)"><div><h3>In diretta ora</h3><p style="color:#FFE3E1">${esc(h.live.title)}</p></div><span class="btn">Guarda la diretta</span></a></section>` : ''}
      <section class="section">${secHead('Ultimi video', '#/video')}${grid(h.latest.slice(0, 8))}</section>
      ${h.programs.length ? `<section class="section">${secHead('I programmi', '#/programmi')}<div class="shelf">${h.programs.map(progCard).join('')}</div></section>` : ''}
      ${h.popular.length ? `<section class="section">${secHead('I più visti', '', '', 'ultimi 60 giorni')}${grid(h.popular.slice(0, 4))}</section>` : ''}
      ${supportBand()}
      ${h.rows.map((c) => `<section class="section">${secHead(c.name, '#/categoria/' + c.slug, c.color)}${grid(c.videos.slice(0, 4))}</section>`).join('')}
      ${h.news.length ? `<section class="section">${secHead('Notizie e approfondimenti', '#/news')}<div class="news-grid">${h.news.map(newsItem).join('')}</div></section>` : ''}`;
    },

    async video(slug) {
      const { video: v, related } = await API.get('/videos/' + encodeURIComponent(slug));
      document.title = v.title + ' · WIARCHIVE';
      const src = API.media(v);
      setTimeout(() => {
        const el = $('#player'); if (!el) return;
        let counted = false;
        el.addEventListener('play', () => { if (!counted) { counted = true; API.post(`/videos/${v.id}/view`).catch(() => {}); } });
        $('#share')?.addEventListener('click', async () => {
          const url = location.href;
          try { await navigator.clipboard.writeText(url); $('#share').textContent = 'Link copiato'; } catch { $('#share').textContent = url; }
        });
      });
      return `<div class="watch"><div>
        <div class="player">${src ? `<video id="player" controls playsinline preload="metadata" src="${esc(src)}" ${v.thumb ? `poster="${esc(API.thumb(v.thumb))}"` : ''}></video>` : '<div class="missing">Il file video di questa puntata non è ancora stato caricato.</div>'}</div>
        <h1>${esc(v.title)}</h1>
        <div class="watch-bar">${chip(v)}<span class="code">${esc(v.code)}</span><span class="views">${Number(v.views).toLocaleString('it-IT')} visualizzazioni · ${ago(v.published_at)}</span>
          <div class="actions"><button class="btn" id="share" type="button">Condividi</button><a class="btn amber" href="#/sostienici">Sostienici</a></div></div>
        <div class="desc"><p>${esc(v.description || v.summary || '')}</p>
          <dl>${v.program_name ? `<dt>Programma</dt><dd><a href="#/programma/${esc(v.program_slug)}" style="color:var(--brand);font-weight:600">${esc(v.program_name)}</a>${v.program_host ? ' · ' + esc(v.program_host) : ''}</dd>` : ''}
          ${v.episode ? `<dt>Puntata</dt><dd>${esc(v.episode)}</dd>` : ''}${v.guests ? `<dt>Ospiti</dt><dd>${esc(v.guests)}</dd>` : ''}
          <dt>Pubblicato</dt><dd>${fullDate(v.published_at)}</dd><dt>Durata</dt><dd>${dur(v.duration)}</dd><dt>Segnatura</dt><dd class="code">${esc(v.code)}</dd></dl></div>
      </div>
      <aside class="side-list"><h3>Guarda anche</h3>${related.map((r) => `<a class="side-item" href="#/video/${esc(r.slug)}">${thumb(r)}<div><div class="t">${esc(r.title)}</div><div class="meta"><span class="prog">${esc(r.program_name || '')}</span><span>${views(r.views)} visual.</span></div></div></a>`).join('') || '<p class="meta">Nessun altro video collegato.</p>'}</aside></div>`;
    },

    async videos(_, params) {
      const q = params.get('q') || '', sort = params.get('sort') || 'new';
      const r = await API.get(`/videos?sort=${sort}${q ? '&q=' + encodeURIComponent(q) : ''}`);
      const qs = (s) => `#/video?sort=${s}${q ? '&q=' + encodeURIComponent(q) : ''}`;
      return `<section class="section"><span class="eyebrow">${q ? 'Ricerca' : 'Archivio completo'}</span><h1 class="page-title">${q ? '“' + esc(q) + '”' : 'Tutti i video'}</h1>
        <div class="filters"><a href="${qs('new')}" class="${sort === 'new' ? 'on' : ''}">Più recenti</a><a href="${qs('views')}" class="${sort === 'views' ? 'on' : ''}">Più visti</a><a href="${qs('old')}" class="${sort === 'old' ? 'on' : ''}">Dal più vecchio</a>
        ${SITE.categories.map((c) => `<a href="#/categoria/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div>
        ${grid(r.items)}</section>`;
    },

    async categoria(slug) {
      const { category: c, videos } = await API.get('/categories/' + encodeURIComponent(slug));
      return `<section class="section"><span class="eyebrow" style="color:${esc(c.color)}">Categoria</span><h1 class="page-title">${esc(c.name)}</h1><p class="lede">${videos.length} video in archivio</p>
        <div class="filters">${SITE.categories.map((x) => `<a href="#/categoria/${esc(x.slug)}" class="${x.slug === c.slug ? 'on' : ''}">${esc(x.name)}</a>`).join('')}</div>${grid(videos)}</section>`;
    },

    async programmi() {
      const list = await API.get('/programs');
      return `<section class="section"><span class="eyebrow">Palinsesto</span><h1 class="page-title">Programmi e rubriche</h1><p class="lede">Ogni trasmissione ha il suo archivio completo di puntate, in ordine di messa in onda.</p></section>
        <section class="section"><div class="prog-grid">${list.map(progCard).join('')}</div></section>`;
    },

    async programma(slug) {
      const { program: p, videos } = await API.get('/programs/' + encodeURIComponent(slug));
      return `<section class="section"><div class="prog-hero"><div><span class="eyebrow" style="color:#7F8DA3">Programma</span><h1 class="page-title">${esc(p.name)}</h1><p class="lede">${esc(p.description || '')}</p></div>
        <dl><dt>Conduce</dt><dd>${esc(p.host || '—')}</dd><dt>In onda</dt><dd>${esc(p.schedule || '—')}</dd><dt>Puntate</dt><dd>${videos.length}</dd></dl></div></section>
        <section class="section">${secHead('Tutte le puntate')}${grid(videos)}</section>`;
    },

    async diretta() {
      const L = await API.get('/live');
      const today = new Date().getDay();
      const order = [1, 2, 3, 4, 5, 6, 0];
      const src = L.hls;
      setTimeout(() => {
        const el = $('#live'); if (!el || !src) return;
        if (el.canPlayType('application/vnd.apple.mpegurl') || !/\.m3u8/.test(src)) el.src = src;
        else if (window.Hls && window.Hls.isSupported()) { const h = new window.Hls(); h.loadSource(src); h.attachMedia(el); }
        else el.parentElement.innerHTML = '<div class="missing">Il tuo browser non supporta la diretta.</div>';
      });
      return `<section class="section"><div class="sec-head"><span class="onair-pill ${L.on ? 'live' : ''}"><span class="dot"></span>${L.on ? 'In onda' : 'Fuori onda'}</span><h2>${esc(L.title)}</h2></div>
        <div class="live-wrap"><div><div class="player">${L.on && src ? '<video id="live" controls autoplay muted loop playsinline></video>'
          : `<div class="offair"><b>Fuori onda</b><span>${esc(L.note || '')}</span></div>`}</div>
          <p class="lede" style="margin-top:14px;font-size:15px">La diretta viene registrata e, dopo la messa in onda, entra nell’archivio con la sua segnatura.</p></div>
        <div class="sched"><h3>Palinsesto settimanale</h3>${order.flatMap((d) => L.schedule.filter((s) => s.day === d)).map((s) => `<div class="slot ${s.day === today ? 'today' : ''}"><span class="d">${DAYS[s.day]}</span><span class="h">${esc(s.time)}</span>
          <span>${s.program_slug ? `<a href="#/programma/${esc(s.program_slug)}"><b>${esc(s.title)}</b></a>` : `<b>${esc(s.title)}</b>`}</span></div>`).join('') || '<div class="slot"><span></span><span></span><span>Palinsesto in aggiornamento</span></div>'}</div></div></section>`;
    },

    async news() {
      const list = await API.get('/articles');
      return `<section class="section"><span class="eyebrow">Redazione</span><h1 class="page-title">Notizie e approfondimenti</h1><p class="lede">Testi, dati e documenti che accompagnano le puntate.</p></section>
        <section class="section"><div class="news-grid">${list.map(newsItem).join('') || '<div class="empty">Nessun articolo pubblicato.</div>'}</div></section>`;
    },

    async articolo(slug) {
      const { article: a, video } = await API.get('/articles/' + encodeURIComponent(slug));
      document.title = a.title + ' · WIARCHIVE';
      return `<article class="article section"><span class="k">${esc(a.kicker || a.category_name || 'Notizie')}</span><h1>${esc(a.title)}</h1><p class="sum">${esc(a.summary || '')}</p>
        <div class="by">Di <b>${esc(a.author || 'Redazione')}</b> · ${fullDate(a.published_at)}</div>
        ${video ? `<a class="inline-video card" href="#/video/${esc(video.slug)}">${thumb(video)}<span class="meta"><span class="code">${esc(video.code)}</span><span>Guarda la puntata: <b>${esc(video.title)}</b></span></span></a>` : ''}
        <div class="body">${a.body || ''}</div></article>`;
    },

    async sostienici() {
      const d = await API.get('/donate');
      const goal = Number(d.goal) || 1, raised = Number(d.raised) || 0, pct = Math.min(100, Math.round((raised / goal) * 100));
      setTimeout(() => {
        let kind = 'monthly', amount = 10;
        const f = $('#pledge');
        f.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; f.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b)); }));
        f.querySelectorAll('.amounts button').forEach((b) => b.addEventListener('click', () => { amount = Number(b.dataset.a); $('#amt').value = amount; f.querySelectorAll('.amounts button').forEach((x) => x.classList.toggle('on', x === b)); }));
        $('#amt').addEventListener('input', (e) => { amount = Number(e.target.value); f.querySelectorAll('.amounts button').forEach((x) => x.classList.toggle('on', Number(x.dataset.a) === amount)); });
        f.addEventListener('submit', async (e) => {
          e.preventDefault(); const out = $('#pledge-out');
          try {
            await API.post('/pledges', { name: $('#p-name').value, email: $('#p-email').value, amount, kind, message: $('#p-msg').value });
            out.className = 'notice ok'; out.textContent = `Grazie! Abbiamo registrato il tuo impegno di ${euro(amount)}${kind === 'monthly' ? ' al mese' : ''}. Completa il versamento con i dati bancari qui a fianco.`; f.reset();
          } catch (err) { out.className = 'notice err'; out.textContent = err.message; }
          out.hidden = false;
        });
        $('#copy-iban')?.addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(d.iban.replace(/\s/g, '')); e.target.textContent = 'Copiato'; } catch { e.target.textContent = 'Seleziona e copia'; } });
      });
      return `<section class="section support"><div>
        <span class="eyebrow">Sostienici</span><h1 class="page-title">L’informazione libera la pagano i cittadini</h1><p class="lede">${esc(d.text)}</p>
        <div class="meter"><div class="bar"><div class="fill" style="width:${pct}%"></div></div><div class="nums"><span>${euro(raised)} raccolti</span><span>obiettivo ${euro(goal)} · ${pct}%</span></div></div>
        <div class="why"><div><b>10 €</b><span>al mese coprono lo spazio d’archivio per circa 40 ore di video in alta qualità.</span></div>
          <div><b>25 €</b><span>finanziano il montaggio e i sottotitoli di una puntata completa.</span></div>
          <div><b>${Number(d.supporters || 0).toLocaleString('it-IT')}</b><span>sostenitori hanno già dato il loro contributo.</span></div></div>
        <div class="panel" style="margin-top:26px"><h3>Bonifico bancario</h3><div class="iban"><span>${esc(d.iban)}</span><button class="btn" id="copy-iban" type="button">Copia IBAN</button></div>
          <p class="meta" style="margin-top:10px">Intestato a <b>&nbsp;${esc(d.holder)}</b> · causale: “Sostegno WIARCHIVE”</p>
          ${d.paypal ? `<p style="margin:14px 0 0"><a class="btn primary" href="${esc(d.paypal)}" target="_blank" rel="noopener">Dona con PayPal</a></p>` : ''}</div></div>
        <form class="panel" id="pledge" novalidate><h3>Diventa sostenitore</h3>
          <div class="seg"><button type="button" class="on" data-k="monthly">Ogni mese</button><button type="button" data-k="once">Una volta</button></div>
          <div class="amounts">${[5, 10, 25, 50].map((a) => `<button type="button" data-a="${a}" class="${a === 10 ? 'on' : ''}">${a} €</button>`).join('')}</div>
          <div class="field"><label for="amt">Importo (€)</label><input id="amt" type="number" min="1" value="10" inputmode="numeric"></div>
          <div class="field"><label for="p-name">Nome e cognome</label><input id="p-name" autocomplete="name"></div>
          <div class="field"><label for="p-email">Email</label><input id="p-email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="p-msg">Un messaggio per la redazione (facoltativo)</label><textarea id="p-msg"></textarea></div>
          <button class="btn amber" type="submit" style="width:100%;justify-content:center;padding:12px">Conferma il sostegno</button>
          <div id="pledge-out" hidden></div></form></section>`;
    },
  };

  // ── Pagina di presentazione (solo nella demo divulgabile)
  pages.progetto = async () => {
    const F = (t, d) => `<div class="feat"><h3>${t}</h3><p>${d}</p></div>`;
    return `<section class="section pitch">
      <span class="eyebrow">Il progetto</span>
      <h1 class="page-title">Una televisione indipendente con la memoria di un archivio</h1>
      <p class="lede">WIARCHIVE è una piattaforma per pubblicare, trasmettere e conservare contenuti video: inchieste, programmi, dirette e approfondimenti. Ogni puntata riceve una <b>segnatura d’archivio</b> e resta ritrovabile nel tempo, come in una biblioteca.</p>
      <div class="pitch-cta"><a class="btn amber" href="#/">Esplora il sito</a><a class="btn primary" href="#/redazione">Prova l’area redazione</a></div>
    </section>
    <section class="section"><div class="sec-head"><h2>Per chi guarda</h2></div><div class="feats">
      ${F('Palinsesto in home', 'Copertina, ultimi video, programmi, i più visti e righe per categoria: si entra e si capisce subito cosa c’è di nuovo.')}
      ${F('Programmi e rubriche', 'Ogni trasmissione ha la sua pagina con conduttore, giorno e ora di messa in onda e tutte le puntate in ordine.')}
      ${F('Diretta', 'Player per le dirette con palinsesto settimanale; la spia “In diretta” si accende su tutto il sito quando si è in onda.')}
      ${F('Notizie collegate ai video', 'Articoli con dati, documenti e fonti, ciascuno collegabile alla puntata che approfondisce.')}
      ${F('Ricerca per segnatura', 'Si cerca per titolo, ospite, parola chiave o codice d’archivio (es. WA-2026-0142).')}
      ${F('Sostegno dei cittadini', 'Pagina “Sostienici” con obiettivo di raccolta, IBAN, PayPal e modulo per diventare sostenitore mensile.')}
    </div></section>
    <section class="section"><div class="sec-head"><h2>Per la redazione</h2><a class="more" href="#/redazione">Provala ora →</a></div><div class="feats">
      ${F('Caricamento semplice', 'Si trascina il file video: durata e copertina vengono ricavate in automatico, la segnatura è assegnata da sola.')}
      ${F('Pubblicazione programmata', 'Bozza, pubblicazione immediata o a data e ora stabilite; un clic per mettere un video in copertina.')}
      ${F('Diretta e palinsesto', 'Si accende la diretta, si cambia il titolo e si aggiorna la settimana senza toccare il codice.')}
      ${F('Sostenitori e newsletter', 'Elenco degli impegni di sostegno e degli iscritti, con l’obiettivo di raccolta aggiornabile.')}
      ${F('Più utenti', 'Amministratori e redattori con accesso personale.')}
      ${F('Numeri a colpo d’occhio', 'Cruscotto con video, visualizzazioni, sostegni e spazio d’archivio usato.')}
    </div></section>
    <section class="section"><div class="sec-head"><h2>Come è costruita</h2></div>
      <div class="tech"><dl>
        <dt>Archivio indipendente</dt><dd>I video restano su server propri: nessuna dipendenza da piattaforme che possono oscurare o demonetizzare i contenuti.</dd>
        <dt>Leggera e veloce</dt><dd>Applicazione Node.js con database integrato; funziona su un singolo server e cresce spostando i video su uno storage con CDN.</dd>
        <dt>Diretta</dt><dd>Si trasmette da OBS verso un servizio di streaming e il sito riceve il flusso.</dd>
        <dt>Da telefono</dt><dd>Sito e redazione si adattano a ogni schermo, con tema chiaro e scuro.</dd>
      </dl></div>
    </section>
    <section class="section"><div class="support-band"><div><h3>Vuoi WIARCHIVE per la tua realtà?</h3><p>Associazioni, testate locali, fondazioni ed enti possono avere la propria televisione-archivio con il proprio marchio.</p></div>
      <a class="btn amber" href="#/redazione">Prova la redazione</a></div></section>`;
  };

  // ── Router
  const routes = [
    [/^\/?$/, 'home'], [/^\/video\/([^/?]+)/, 'video'], [/^\/video\/?$/, 'videos'], [/^\/categoria\/([^/?]+)/, 'categoria'],
    [/^\/programmi\/?$/, 'programmi'], [/^\/programma\/([^/?]+)/, 'programma'], [/^\/diretta\/?$/, 'diretta'],
    [/^\/news\/?$/, 'news'], [/^\/news\/([^/?]+)/, 'articolo'], [/^\/sostienici\/?$/, 'sostienici'],
    [/^\/progetto\/?$/, 'progetto'], [/^\/redazione\/?$/, 'redazione'],
  ];
  let adminBooted = false;
  async function route() {
    const raw = (location.hash || '#/').slice(1);
    const [path, qs] = raw.split('?');
    const params = new URLSearchParams(qs || '');
    const main = $('#app');
    let name = 'home', arg;
    for (const [re, n] of routes) { const m = path.match(re); if (m) { name = n; arg = m[1] && decodeURIComponent(m[1]); break; } }
    const site = document.getElementById('site'), root = document.getElementById('root');
    if (name === 'redazione') {
      if (!window.WA_ADMIN_BOOT) { location.href = '/admin'; return; }
      if (site) site.hidden = true; if (root) root.hidden = false;
      if (!adminBooted) { adminBooted = true; window.WA_ADMIN_BOOT(); }
      document.querySelectorAll('[data-demo]').forEach((a) => a.classList.toggle('on', a.dataset.demo === 'redazione'));
      window.scrollTo(0, 0); return;
    }
    if (site) site.hidden = false; if (root) root.hidden = true;
    document.querySelectorAll('[data-demo]').forEach((a) => a.classList.toggle('on', a.dataset.demo === (name === 'progetto' ? 'progetto' : 'sito')));
    if (name === 'progetto' && !window.WA_DEMO) name = 'home';
    document.title = (SITE.site_name || 'WIARCHIVE') + ' · ' + (SITE.tagline || '');
    API.get('/site').then((st) => { const on = st.live_on === '1', pill = $('#onair'); if (pill) { pill.classList.toggle('live', on); pill.lastChild.textContent = on ? 'In diretta' : 'Fuori onda'; } }).catch(() => {});
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name || (a.dataset.nav === 'videos' && name === 'video') || (a.dataset.nav === 'news' && name === 'articolo') || (a.dataset.nav === 'programmi' && name === 'programma')));
    document.querySelectorAll('[data-cat]').forEach((a) => a.classList.toggle('on', name === 'categoria' && a.dataset.cat === arg));
    $('.nav')?.classList.remove('open');
    main.innerHTML = '<div class="skeleton"></div>';
    try { main.innerHTML = await pages[name](arg, params); }
    catch (e) { main.innerHTML = `<div class="empty"><b>${esc(e.message)}</b><br><a href="#/" style="color:var(--brand)">Torna alla home</a></div>`; }
    window.scrollTo(0, 0);
  }

  async function boot() {
    try { SITE = await API.get('/site'); } catch {}
    $('#catbar').innerHTML = `<a href="#/video" data-cat="__all">Tutto l’archivio</a>` + SITE.categories.map((c) => `<a href="#/categoria/${esc(c.slug)}" data-cat="${esc(c.slug)}"><i style="background:${esc(c.color)}"></i>${esc(c.name)}</a>`).join('')
      + `<span class="ticker">${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</span>`;
    const pill = $('#onair');
    if (SITE.live_on === '1') { pill.classList.add('live'); pill.lastChild.textContent = 'In diretta'; }
    $('#search').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value.trim(); location.hash = q ? '#/video?q=' + encodeURIComponent(q) : '#/video'; });
    $('.menu-btn').addEventListener('click', () => $('.nav').classList.toggle('open'));
    $('#nl').addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('#nl button');
      try { await API.post('/subscribe', { email: $('#nl-email').value }); b.textContent = 'Iscritto ✓'; $('#nl-email').value = ''; } catch (err) { b.textContent = 'Email non valida'; }
    });
    $('#year').textContent = new Date().getFullYear();
    window.addEventListener('hashchange', route);
    route();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
