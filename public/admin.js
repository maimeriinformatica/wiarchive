/* WIARCHIVE — area redazione */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(method, url, body) {
    const r = await fetch('/api' + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && url !== '/auth/login') { ME = null; renderLogin(); throw new Error('Sessione scaduta'); }
    if (!r.ok) throw new Error(j.error || 'Operazione non riuscita');
    return j;
  }
  const toast = (m) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2600); };
  const dur = (s) => { s = s | 0; const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const mb = (b) => b ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : '—';
  const dt = (d) => d ? new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const toLocalInput = (d) => { if (!d) return ''; const t = new Date(String(d).replace(' ', 'T') + 'Z'); const o = t.getTimezoneOffset(); return new Date(t - o * 60000).toISOString().slice(0, 16); };
  const fromLocalInput = (v) => v ? new Date(v).toISOString().replace('T', ' ').slice(0, 19) : '';
  const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  let ME = null, CATS = [], PROGS = [];
  const DEMO = !!window.WA_DEMO;
  const HOME = DEMO ? '#/' : '/';
  const VIDURL = (slug) => (DEMO ? '#/video/' : '/#/video/') + slug;
  const NEWTAB = DEMO ? '' : ' target="_blank"';
  const TH = (f) => /^(data|blob|https?):/.test(f) ? f : '/thumbs/' + f;

  const miniThumb = (v) => v.thumb ? `<div class="thumb"><img src="${esc(TH(v.thumb))}" alt=""><span class="dur">${dur(v.duration)}</span></div>`
    : `<div class="thumb"><div class="poster" style="background:#1B3FA6"><span class="pc">${esc(v.code || '')}</span></div></div>`;
  const opt = (list, sel, label = 'name') => `<option value="">—</option>` + list.map((x) => `<option value="${x.id}" ${String(x.id) === String(sel) ? 'selected' : ''}>${esc(x[label])}</option>`).join('');

  // ── Login
  function renderLogin() {
    $('#root').innerHTML = `<div class="login"><form id="lf"><a class="logo" style="font-size:28px"><span class="wi">WI</span><span class="ar">ARCHIVE</span></a>
      <p style="color:var(--ink-3);margin:8px 0 20px">Area redazione</p>
      <div class="field"><label for="le">Email</label><input id="le" type="email" autocomplete="username" required></div>
      <div class="field"><label for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>
      ${DEMO ? '<p class="notice ok" style="margin:0 0 12px">Demo: credenziali già inserite, premi <b>Entra</b>.</p>' : ''}
      <button class="btn primary" style="width:100%;justify-content:center;padding:11px">Entra</button><div id="lerr"></div>
      <p style="margin:18px 0 0;font-size:12.5px"><a href="${HOME}" style="color:var(--brand)">← Torna al sito</a></p></form></div>`;
    if (DEMO) { $('#le').value = 'redazione@wiarchive.it'; $('#lp').value = 'demo'; }
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { ME = await api('POST', '/auth/login', { email: $('#le').value, password: $('#lp').value }); shell(); }
      catch (err) { $('#lerr').className = 'notice err'; $('#lerr').textContent = err.message; }
    });
  }

  // ── Struttura
  const TABS = [['dash', 'Cruscotto'], ['videos', 'Video'], ['programs', 'Programmi'], ['categories', 'Categorie'], ['articles', 'Articoli'], ['live', 'Diretta e palinsesto'], ['support', 'Sostenitori'], ['settings', 'Impostazioni']];
  async function shell(tab = 'dash') {
    [CATS, PROGS] = await Promise.all([api('GET', '/admin/categories'), api('GET', '/admin/programs')]);
    $('#root').innerHTML = `<div class="adm"><aside><a class="logo" href="${HOME}"${NEWTAB}><span class="wi">WI</span><span class="ar">ARCHIVE</span></a>
      ${TABS.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}
      <div class="who">${esc(ME.name || ME.email)}<br><span style="color:#6F7F96">${ME.role === 'admin' ? 'Amministratore' : 'Redattore'}</span><br><button id="logout" style="padding:6px 0;color:#FF8A84">Esci</button></div></aside>
      <section class="content" id="view"></section></div>`;
    document.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => go(b.dataset.t)));
    $('#logout').addEventListener('click', async () => { await api('POST', '/auth/logout'); ME = null; renderLogin(); });
    go(tab);
  }
  async function go(tab, arg) {
    document.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const v = $('#view'); v.innerHTML = '<div class="skeleton"></div>';
    try { await VIEWS[tab](v, arg); } catch (e) { v.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
  }

  const VIEWS = {
    async dash(v) {
      const s = await api('GET', '/admin/stats');
      const eur = (n) => Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
      v.innerHTML = `<h1>Cruscotto</h1><div class="kpis">
        <div class="kpi"><span>Video in archivio</span><b>${s.videos}</b><span>${s.published} pubblicati</span></div>
        <div class="kpi"><span>Visualizzazioni</span><b>${Number(s.views).toLocaleString('it-IT')}</b></div>
        <div class="kpi"><span>Impegni di sostegno</span><b>${eur(s.pledged)}</b><span>${s.pledges} sostenitori</span></div>
        <div class="kpi"><span>Spazio video usato</span><b>${Number(s.storage_mb).toLocaleString('it-IT')} MB</b><span>${s.subscribers} iscritti newsletter</span></div></div>
        <div class="two"><div><h2 class="eyebrow" style="margin:0 0 8px">I più visti</h2><div class="tbl-wrap"><table><tr><th>Segnatura</th><th>Titolo</th><th style="text-align:right">Visual.</th></tr>
        ${s.top.map((t) => `<tr><td class="code">${esc(t.code)}</td><td>${esc(t.title)}</td><td class="num">${Number(t.views).toLocaleString('it-IT')}</td></tr>`).join('')}</table></div></div>
        <div class="panel"><h3>Azioni rapide</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="q1">Carica un video</button><button class="btn" id="q2">Scrivi un articolo</button><button class="btn" id="q3">Gestisci la diretta</button></div></div></div>`;
      $('#q1').onclick = () => go('videos', 'new'); $('#q2').onclick = () => go('articles', 'new'); $('#q3').onclick = () => go('live');
    },

    async videos(v, arg) {
      if (arg) return videoForm(v, arg === 'new' ? null : arg);
      const list = await api('GET', '/admin/videos');
      const draw = (q = '') => {
        const f = list.filter((x) => !q || (x.title + x.code + (x.program_name || '')).toLowerCase().includes(q.toLowerCase()));
        $('#vt').innerHTML = `<tr><th></th><th>Segnatura</th><th>Titolo</th><th>Programma</th><th>Stato</th><th style="text-align:right">Visual.</th><th>File</th><th></th></tr>` +
          f.map((x) => `<tr><td class="tmb">${miniThumb(x)}</td><td class="code">${esc(x.code)}</td><td><b>${esc(x.title)}</b><br><span class="meta">${esc(x.category_name || '')} · ${dt(x.published_at)}</span></td>
          <td>${esc(x.program_name || '—')}</td><td><span class="pill ${x.status === 'published' ? 'pub' : 'draft'}">${x.status === 'published' ? 'Pubblicato' : 'Bozza'}</span>${x.featured ? ' <span class="pill feat">In copertina</span>' : ''}</td>
          <td class="num">${Number(x.views).toLocaleString('it-IT')}</td><td class="meta">${x.file ? mb(x.size) : '<span style="color:var(--onair)">manca</span>'}</td>
          <td style="white-space:nowrap"><button class="link" data-e="${x.id}">Modifica</button>${x.status === 'published' ? `<a class="link" href="${VIDURL(esc(x.slug))}"${NEWTAB}>Apri</a>` : ''}</td></tr>`).join('');
        v.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => go('videos', b.dataset.e)));
      };
      v.innerHTML = `<h1>Video</h1><div class="toolbar"><button class="btn primary" id="nv">+ Carica video</button><input id="vs" placeholder="Filtra per titolo, segnatura, programma"></div><div class="tbl-wrap"><table id="vt"></table></div>`;
      $('#nv').onclick = () => go('videos', 'new'); $('#vs').oninput = (e) => draw(e.target.value); draw();
    },

    programs: (v, arg) => entity(v, arg, {
      title: 'Programmi', path: 'programs', single: 'programma',
      cols: [['name', 'Nome'], ['host', 'Conduttore'], ['schedule', 'In onda'], ['active', 'Attivo', (x) => (x.active ? 'Sì' : 'No')]],
      fields: [['name', 'Nome del programma', 'text', 1], ['host', 'Conduttore/i'], ['schedule', 'Giorno e ora (es. Lunedì · 21:00)'], ['position', 'Ordine', 'number'],
        ['description', 'Descrizione', 'textarea', 1], ['active', 'Programma attivo (visibile nel sito)', 'check']],
    }),
    categories: (v, arg) => entity(v, arg, {
      title: 'Categorie', path: 'categories', single: 'categoria',
      cols: [['name', 'Nome'], ['color', 'Colore', (x) => `<span class="chip" style="color:${esc(x.color)}"><i style="background:${esc(x.color)}"></i>${esc(x.color)}</span>`], ['position', 'Ordine']],
      fields: [['name', 'Nome', 'text', 1], ['color', 'Colore', 'color'], ['position', 'Ordine', 'number']],
    }),
    async articles(v, arg) {
      const vids = await api('GET', '/admin/videos');
      return entity(v, arg, {
        title: 'Articoli', path: 'articles', single: 'articolo',
        cols: [['title', 'Titolo'], ['author', 'Autore'], ['status', 'Stato', (x) => `<span class="pill ${x.status === 'published' ? 'pub' : 'draft'}">${x.status === 'published' ? 'Pubblicato' : 'Bozza'}</span>`], ['published_at', 'Data', (x) => dt(x.published_at)]],
        fields: [['title', 'Titolo', 'text', 1], ['kicker', 'Occhiello (es. Inchiesta)'], ['author', 'Autore'], ['category_id', 'Categoria', 'select', 0, CATS],
          ['video_id', 'Video collegato', 'select', 0, vids.map((x) => ({ id: x.id, name: `${x.code} — ${x.title}` }))], ['status', 'Stato', 'status'],
          ['summary', 'Sommario', 'textarea', 1], ['body', 'Testo (HTML semplice: <p>, <blockquote>, <a>, <b>)', 'rich', 1]],
      });
    },

    async live(v) {
      const [s, sched] = await Promise.all([api('GET', '/admin/settings'), api('GET', '/admin/schedule')]);
      v.innerHTML = `<h1>Diretta e palinsesto</h1><div class="two"><form class="panel" id="lf">
        <h3>Diretta</h3><label class="check"><input type="checkbox" id="lon" ${s.live_on === '1' ? 'checked' : ''}> Siamo in onda</label>
        <div class="field"><label for="lt">Titolo della diretta</label><input id="lt" value="${esc(s.live_title)}"></div>
        <div class="field"><label for="lh">Indirizzo del flusso HLS (.m3u8)</label><input id="lh" value="${esc(s.live_hls)}" placeholder="https://…/live/index.m3u8"></div>
        <div class="field"><label for="ln">Messaggio quando si è fuori onda</label><textarea id="ln">${esc(s.live_note)}</textarea></div>
        <p class="meta" style="margin:0 0 12px">Trasmetti da OBS verso un server di streaming (es. Owncast, Cloudflare Stream, Mux) e incolla qui l’indirizzo .m3u8 che ti fornisce.</p>
        <button class="btn primary">Salva diretta</button></form>
        <div><div class="tbl-wrap"><table id="st"></table></div>
        <form class="panel" id="sf" style="margin-top:14px"><h3>Aggiungi al palinsesto</h3><div class="two" style="gap:0 12px">
          <div class="field"><label for="sd">Giorno</label><select id="sd">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
          <div class="field"><label for="sh">Ora</label><input id="sh" type="time" value="21:00" required></div>
          <div class="field"><label for="stt">Titolo</label><input id="stt" required></div>
          <div class="field"><label for="sp">Programma</label><select id="sp">${opt(PROGS)}</select></div></div><button class="btn primary">Aggiungi</button></form></div></div>`;
      const draw = (rows) => {
        $('#st').innerHTML = `<tr><th>Giorno</th><th>Ora</th><th>Titolo</th><th></th></tr>` + rows.map((r) => `<tr><td>${DAYS[r.day]}</td><td class="code">${esc(r.time)}</td><td>${esc(r.title)}</td><td><button class="link danger" data-d="${r.id}">Rimuovi</button></td></tr>`).join('');
        v.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { await api('DELETE', '/admin/schedule/' + b.dataset.d); draw(await api('GET', '/admin/schedule')); }));
      };
      draw(sched);
      $('#sp').onchange = (e) => { if (!$('#stt').value) $('#stt').value = e.target.selectedOptions[0].textContent; };
      $('#lf').onsubmit = async (e) => { e.preventDefault(); await api('PUT', '/admin/settings', { live_on: $('#lon').checked ? '1' : '0', live_title: $('#lt').value, live_hls: $('#lh').value, live_note: $('#ln').value }); toast('Diretta aggiornata'); };
      $('#sf').onsubmit = async (e) => { e.preventDefault(); await api('POST', '/admin/schedule', { day: Number($('#sd').value), time: $('#sh').value, title: $('#stt').value, program_id: $('#sp').value || null }); $('#stt').value = ''; draw(await api('GET', '/admin/schedule')); toast('Aggiunto al palinsesto'); };
    },

    async support(v) {
      const [s, pl, subs] = await Promise.all([api('GET', '/admin/settings'), api('GET', '/admin/pledges'), api('GET', '/admin/subscribers')]);
      v.innerHTML = `<h1>Sostenitori</h1><div class="two"><form class="panel" id="df"><h3>Pagina “Sostienici”</h3>
        <div class="field"><label for="d1">IBAN</label><input id="d1" value="${esc(s.donate_iban)}"></div>
        <div class="field"><label for="d2">Intestatario</label><input id="d2" value="${esc(s.donate_holder)}"></div>
        <div class="field"><label for="d3">Link PayPal / pagamento (facoltativo)</label><input id="d3" value="${esc(s.donate_paypal)}" placeholder="https://paypal.me/…"></div>
        <div class="two" style="gap:0 12px"><div class="field"><label for="d4">Obiettivo (€)</label><input id="d4" type="number" value="${esc(s.donate_goal)}"></div>
        <div class="field"><label for="d5">Raccolti finora (€)</label><input id="d5" type="number" value="${esc(s.donate_raised)}"></div></div>
        <div class="field"><label for="d6">Testo di presentazione</label><textarea id="d6">${esc(s.donate_text)}</textarea></div><button class="btn primary">Salva</button></form>
        <div><h2 class="eyebrow" style="margin:0 0 8px">Iscritti newsletter (${subs.length})</h2><div class="tbl-wrap" style="max-height:320px;overflow:auto"><table><tr><th>Email</th><th>Data</th></tr>
        ${subs.map((x) => `<tr><td>${esc(x.email)}</td><td class="meta">${dt(x.created_at)}</td></tr>`).join('') || '<tr><td colspan="2" class="meta">Nessun iscritto</td></tr>'}</table></div>
        <button class="btn" id="csv" style="margin-top:10px">Copia elenco email</button></div></div>
        <h2 class="eyebrow" style="margin:26px 0 8px">Impegni di sostegno ricevuti (${pl.length})</h2><div class="tbl-wrap"><table><tr><th>Data</th><th>Nome</th><th>Email</th><th>Tipo</th><th style="text-align:right">Importo</th><th>Messaggio</th></tr>
        ${pl.map((x) => `<tr><td class="meta">${dt(x.created_at)}</td><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${x.kind === 'monthly' ? 'Mensile' : 'Una tantum'}</td><td class="num">${Number(x.amount).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</td><td>${esc(x.message)}</td></tr>`).join('') || '<tr><td colspan="6" class="meta">Nessun impegno ancora</td></tr>'}</table></div>`;
      $('#df').onsubmit = async (e) => { e.preventDefault(); await api('PUT', '/admin/settings', { donate_iban: $('#d1').value, donate_holder: $('#d2').value, donate_paypal: $('#d3').value, donate_goal: $('#d4').value, donate_raised: $('#d5').value, donate_text: $('#d6').value }); toast('Pagina Sostienici aggiornata'); };
      $('#csv').onclick = async () => { try { await navigator.clipboard.writeText(subs.map((x) => x.email).join('\n')); toast('Elenco copiato'); } catch { toast('Copia non disponibile'); } };
    },

    async settings(v) {
      const s = await api('GET', '/admin/settings');
      const users = ME.role === 'admin' ? await api('GET', '/admin/users') : [];
      v.innerHTML = `<h1>Impostazioni</h1><div class="two"><div><form class="panel" id="gf"><h3>Sito</h3>
        <div class="field"><label for="g1">Nome</label><input id="g1" value="${esc(s.site_name)}"></div>
        <div class="field"><label for="g2">Motto</label><input id="g2" value="${esc(s.tagline)}"></div>
        <div class="field"><label for="g3">Email redazione</label><input id="g3" value="${esc(s.contact_email)}"></div><button class="btn primary">Salva</button></form>
        <form class="panel" id="pf" style="margin-top:14px"><h3>La mia password</h3><div class="field"><label for="np">Nuova password (min. 8 caratteri)</label><input id="np" type="password" autocomplete="new-password"></div><button class="btn primary">Cambia password</button></form></div>
        ${ME.role === 'admin' ? `<div><div class="tbl-wrap"><table id="ut"><tr><th>Utente</th><th>Ruolo</th><th></th></tr>${users.map((u) => `<tr><td><b>${esc(u.name || '')}</b><br><span class="meta">${esc(u.email)}</span></td><td>${u.role === 'admin' ? 'Amministratore' : 'Redattore'}</td><td>${u.id !== ME.id ? `<button class="link danger" data-u="${u.id}">Elimina</button>` : ''}</td></tr>`).join('')}</table></div>
        <form class="panel" id="uf" style="margin-top:14px"><h3>Nuovo utente</h3><div class="field"><label for="u1">Nome</label><input id="u1"></div><div class="field"><label for="u2">Email</label><input id="u2" type="email" required></div>
        <div class="field"><label for="u3">Password iniziale</label><input id="u3" type="text" required></div><div class="field"><label for="u4">Ruolo</label><select id="u4"><option value="editor">Redattore</option><option value="admin">Amministratore</option></select></div>
        <button class="btn primary">Crea utente</button></form></div>` : ''}</div>`;
      $('#gf').onsubmit = async (e) => { e.preventDefault(); await api('PUT', '/admin/settings', { site_name: $('#g1').value, tagline: $('#g2').value, contact_email: $('#g3').value }); toast('Salvato'); };
      $('#pf').onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/admin/me/password', { password: $('#np').value }); toast('Password aggiornata'); $('#np').value = ''; } catch (err) { toast(err.message); } };
      if ($('#uf')) {
        $('#uf').onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/admin/users/new', { name: $('#u1').value, email: $('#u2').value, password: $('#u3').value, role: $('#u4').value }); toast('Utente creato'); go('settings'); } catch (err) { toast(err.message); } };
        v.querySelectorAll('[data-u]').forEach((b) => (b.onclick = () => confirmDo(b, async () => { await api('DELETE', '/admin/users/' + b.dataset.u); go('settings'); })));
      }
    },
  };

  // Conferma in due clic (senza finestre di dialogo)
  function confirmDo(btn, fn) {
    if (btn.dataset.armed) return fn();
    btn.dataset.armed = '1'; const t = btn.textContent; btn.textContent = 'Clicca di nuovo per confermare';
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = t; }, 3500);
  }

  // ── Editor generico
  async function entity(v, arg, cfg) {
    if (arg) {
      const cur = arg === 'new' ? {} : (await api('GET', '/admin/' + cfg.path)).find((x) => String(x.id) === String(arg)) || {};
      v.innerHTML = `<h1>${arg === 'new' ? 'Nuovo ' + cfg.single : 'Modifica ' + cfg.single}</h1><form class="form" id="ef">${cfg.fields.map(([k, label, type = 'text', full, list]) => {
        const val = cur[k] ?? (type === 'check' ? 1 : type === 'color' ? '#1B3FA6' : '');
        const cls = full ? 'field full' : 'field';
        if (type === 'textarea') return `<div class="${cls}"><label for="f_${k}">${esc(label)}</label><textarea id="f_${k}">${esc(val)}</textarea></div>`;
        if (type === 'rich') return `<div class="${cls}"><label for="f_${k}">${esc(label)}</label><textarea id="f_${k}" style="min-height:260px;font-family:var(--mono);font-size:13px">${esc(val)}</textarea></div>`;
        if (type === 'check') return `<label class="check full"><input type="checkbox" id="f_${k}" ${val ? 'checked' : ''}> ${esc(label)}</label>`;
        if (type === 'select') return `<div class="${cls}"><label for="f_${k}">${esc(label)}</label><select id="f_${k}">${opt(list, val)}</select></div>`;
        if (type === 'status') return `<div class="${cls}"><label for="f_${k}">${esc(label)}</label><select id="f_${k}"><option value="draft">Bozza</option><option value="published" ${val === 'published' ? 'selected' : ''}>Pubblicato</option></select></div>`;
        return `<div class="${cls}"><label for="f_${k}">${esc(label)}</label><input id="f_${k}" type="${type}" value="${esc(val)}"></div>`;
      }).join('')}<div class="actions-row"><button class="btn primary">Salva</button><button class="btn" type="button" id="back">Annulla</button>
        ${cur.id ? '<button class="link danger" type="button" id="del" style="margin-left:auto">Elimina</button>' : ''}</div></form>`;
      $('#back').onclick = () => go(cfg.path);
      if ($('#del')) $('#del').onclick = (e) => confirmDo(e.target, async () => { await api('DELETE', `/admin/${cfg.path}/${cur.id}`); toast('Eliminato'); go(cfg.path); });
      $('#ef').onsubmit = async (e) => {
        e.preventDefault();
        const body = {};
        for (const [k, , type] of cfg.fields) { const el = $('#f_' + k); body[k] = type === 'check' ? (el.checked ? 1 : 0) : el.value; }
        try { cur.id ? await api('PUT', `/admin/${cfg.path}/${cur.id}`, body) : await api('POST', '/admin/' + cfg.path, body); toast('Salvato'); if (cfg.path === 'programs' || cfg.path === 'categories') [CATS, PROGS] = await Promise.all([api('GET', '/admin/categories'), api('GET', '/admin/programs')]); go(cfg.path); }
        catch (err) { toast(err.message); }
      };
      return;
    }
    const list = await api('GET', '/admin/' + cfg.path);
    v.innerHTML = `<h1>${cfg.title}</h1><div class="toolbar"><button class="btn primary" id="new">+ Nuovo ${cfg.single}</button></div><div class="tbl-wrap"><table>
      <tr>${cfg.cols.map((c) => `<th>${c[1]}</th>`).join('')}<th></th></tr>
      ${list.map((x) => `<tr>${cfg.cols.map(([k, , f]) => `<td>${f ? f(x) : esc(x[k])}</td>`).join('')}<td><button class="link" data-e="${x.id}">Modifica</button></td></tr>`).join('') || `<tr><td colspan="9" class="meta">Ancora nessun elemento.</td></tr>`}</table></div>`;
    $('#new').onclick = () => go(cfg.path, 'new');
    v.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => go(cfg.path, b.dataset.e)));
  }

  // ── Editor video con caricamento
  async function videoForm(v, id) {
    const cur = id ? await api('GET', '/admin/videos/' + id) : { status: 'draft' };
    v.innerHTML = `<h1>${id ? 'Modifica video' : 'Carica un video'}</h1>
      ${cur.code ? `<p class="meta" style="margin:-8px 0 16px">Segnatura <span class="code">${esc(cur.code)}</span> · ${cur.file ? `file ${mb(cur.size)} · durata ${dur(cur.duration)}` : 'nessun file caricato'}</p>` : ''}
      <form class="form" id="vf">
        <div class="field full"><label>File video (MP4 consigliato, H.264 + AAC)</label>
          <div class="drop" id="drop"><b>${cur.file ? 'Trascina qui un nuovo file per sostituire il video' : 'Trascina qui il file video'}</b><br><span class="meta" style="justify-content:center">oppure clicca per sceglierlo · MP4, WebM, MOV</span></div>
          <input type="file" id="vfile" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" hidden></div>
        <div class="field full"><label for="v_title">Titolo</label><input id="v_title" value="${esc(cur.title)}" required></div>
        <div class="field"><label for="v_program_id">Programma</label><select id="v_program_id">${opt(PROGS, cur.program_id)}</select></div>
        <div class="field"><label for="v_category_id">Categoria</label><select id="v_category_id">${opt(CATS, cur.category_id)}</select></div>
        <div class="field"><label for="v_episode">Puntata (es. S3 · E12)</label><input id="v_episode" value="${esc(cur.episode)}"></div>
        <div class="field"><label for="v_guests">Ospiti</label><input id="v_guests" value="${esc(cur.guests)}"></div>
        <div class="field full"><label for="v_summary">Sommario (appare nelle anteprime)</label><textarea id="v_summary" style="min-height:60px">${esc(cur.summary)}</textarea></div>
        <div class="field full"><label for="v_description">Descrizione completa</label><textarea id="v_description" style="min-height:140px">${esc(cur.description)}</textarea></div>
        <div class="field"><label for="v_tags">Parole chiave (separate da virgola)</label><input id="v_tags" value="${esc(cur.tags)}"></div>
        <div class="field"><label for="tfile">Copertina (facoltativa — altrimenti generata dal video)</label><input type="file" id="tfile" accept="image/jpeg,image/png,image/webp"></div>
        <div class="field"><label for="v_status">Stato</label><select id="v_status"><option value="draft">Bozza</option><option value="published" ${cur.status === 'published' ? 'selected' : ''}>Pubblicato</option></select></div>
        <div class="field"><label for="v_published_at">Data di pubblicazione (vuoto = subito)</label><input id="v_published_at" type="datetime-local" value="${toLocalInput(cur.published_at)}"></div>
        <label class="check full"><input type="checkbox" id="v_featured" ${cur.featured ? 'checked' : ''}> Metti in copertina nella home</label>
        <div class="actions-row"><button class="btn primary" id="save">${id ? 'Salva modifiche' : 'Carica e salva'}</button><button class="btn" type="button" id="back">Annulla</button>
          ${id ? '<button class="link danger" type="button" id="del" style="margin-left:auto">Elimina video e file</button>' : ''}</div>
        <div class="full" id="up" hidden><div class="progress"><div id="bar"></div></div><p class="meta" id="upt" style="margin-top:6px"></p></div>
      </form>`;
    let file = null;
    const drop = $('#drop'), inp = $('#vfile');
    const pick = (f) => { if (!f) return; file = f; drop.innerHTML = `<b>${esc(f.name)}</b><br><span class="meta" style="justify-content:center">${mb(f.size)} · pronto per il caricamento</span>`; if (!$('#v_title').value) $('#v_title').value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '); };
    drop.onclick = () => inp.click(); inp.onchange = () => pick(inp.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
    $('#back').onclick = () => go('videos');
    if ($('#del')) $('#del').onclick = (e) => confirmDo(e.target, async () => { await api('DELETE', '/admin/videos/' + id); toast('Video eliminato'); go('videos'); });
    $('#vf').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData();
      for (const k of ['title', 'program_id', 'category_id', 'episode', 'guests', 'summary', 'description', 'tags', 'status']) fd.append(k, $('#v_' + k).value);
      fd.append('published_at', fromLocalInput($('#v_published_at').value));
      fd.append('featured', $('#v_featured').checked ? '1' : '0');
      if (file) fd.append('video', file);
      if ($('#tfile').files[0]) fd.append('thumb', $('#tfile').files[0]);
      $('#up').hidden = false; $('#save').disabled = true;
      const done = (status, j) => {
        $('#save').disabled = false;
        if (status >= 200 && status < 300) { toast('Video salvato'); go('videos'); } else { $('#upt').textContent = j.error || 'Caricamento non riuscito'; $('#upt').style.color = 'var(--onair)'; }
      };
      if (DEMO) {
        $('#bar').style.width = '100%'; $('#upt').textContent = 'Elaborazione del video (durata e copertina)…';
        fetch('/api/admin/videos' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: fd }).then(async (r) => done(r.status, await r.json().catch(() => ({}))));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open(id ? 'PUT' : 'POST', '/api/admin/videos' + (id ? '/' + id : ''));
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) { const p = Math.round((ev.loaded / ev.total) * 100); $('#bar').style.width = p + '%'; $('#upt').textContent = p < 100 ? `Caricamento ${p}% — ${mb(ev.loaded)} di ${mb(ev.total)}` : 'Elaborazione del video (durata e copertina)…'; } };
      xhr.onload = () => { let j = {}; try { j = JSON.parse(xhr.responseText); } catch {} done(xhr.status, j); };
      xhr.onerror = () => { $('#save').disabled = false; $('#upt').textContent = 'Connessione interrotta durante il caricamento. Riprova.'; };
      xhr.send(fd);
    };
  }

  const boot = () => api('GET', '/auth/me').then((u) => { ME = u; shell(); }).catch(() => renderLogin());
  if (DEMO) window.WA_ADMIN_BOOT = boot; else boot();
})();
