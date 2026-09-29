// Genera la demo divulgabile di WIARCHIVE (sito + redazione, tutto nel browser):
//   proto/wiarchive-demo.html          → pagina completa, da caricare su qualsiasi hosting
//   proto/wiarchive-demo.fragment.html → stessa pagina senza <html>/<head> (per la pubblicazione come Artifact)
// Uso: npm run seed:clips && node build-prototype.js
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'wiarchive.db'), { readonly: true });
const all = (t) => db.prepare(`SELECT * FROM ${t}`).all();
const SEED = {
  builtAt: Date.now(), now: new Date().toISOString().replace('T', ' ').slice(0, 19),
  categories: all('categories'), programs: all('programs'), schedule: all('schedule'), articles: all('articles'),
  videos: all('videos').map((v) => ({ ...v, thumb: null, file: v.file ? 'anteprima.mp4' : null })),
  settings: Object.fromEntries(all('settings').map((r) => [r.key, r.value])),
};
const clipPath = path.join(__dirname, 'proto', 'clip.mp4');
if (!fs.existsSync(clipPath)) throw new Error('Manca proto/clip.mp4 (clip di anteprima)');
const CLIP = 'data:video/mp4;base64,' + fs.readFileSync(clipPath).toString('base64');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const css = read('public/styles.css');
const adminCss = read('public/admin.html').split('<style>')[1].split('</style>')[0].replace('body { font-size: 14px; }', '.adm, .login { font-size: 14px; }');
const shell = read('public/index.html').split('<!--SHELL-START-->')[1].split('<!--SHELL-END-->')[0]
  .replace('<a href="/admin">Area redazione</a>', '<a href="#/redazione">Area redazione</a><a href="#/progetto">Il progetto</a>');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,700&display=swap">';
const body = `<style>${css}
${adminCss}
.demo-bar { background: var(--amber); color: #111; font-size: 13px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 7px 20px; }
.demo-bar b { font-family: var(--mono); font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; }
.demo-bar nav { display: flex; gap: 4px; }
.demo-bar nav a { padding: 3px 10px; border-radius: 999px; font-weight: 700; }
.demo-bar nav a.on { background: #111; color: var(--amber); }
.demo-bar span { margin-left: auto; opacity: .8; }
@media (max-width: 700px) { .demo-bar span { margin-left: 0; width: 100%; } }
.adm { min-height: calc(100vh - 34px); } .adm aside { height: calc(100vh - 34px); }
</style>
<div class="demo-bar"><b>Demo WIARCHIVE</b><nav><a href="#/progetto" data-demo="progetto">Il progetto</a><a href="#/" data-demo="sito">Sito pubblico</a><a href="#/redazione" data-demo="redazione">Area redazione</a></nav>
<span>Contenuti fittizi · le modifiche restano solo in questa finestra</span></div>
<div id="site">${shell}</div>
<div id="root" hidden></div>
<script>window.WA_SEED=${safe(JSON.stringify(SEED))};window.WA_CLIP=${JSON.stringify(CLIP)};</script>
<script>${safe(read('proto/mock-server.js'))}</script>
<script>${safe(read('public/admin.js'))}</script>
<script>if(!location.hash){try{history.replaceState(null,'','#/progetto');}catch(e){location.hash='#/progetto';}}</script>
<script>${safe(read('public/app.js'))}</script>`;

fs.writeFileSync(path.join(__dirname, 'proto', 'wiarchive-demo.fragment.html'), `<title>WIARCHIVE</title>\n${FONTS}\n${body}`);
fs.writeFileSync(path.join(__dirname, 'proto', 'wiarchive-demo.html'), `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>WIARCHIVE · Demo</title><meta name="description" content="Demo della piattaforma WIARCHIVE: televisione e archivio video indipendente.">
${FONTS}</head><body>
${body}
</body></html>`);
console.log('Demo generata:', (Buffer.byteLength(body) / 1024).toFixed(0), 'KB');
