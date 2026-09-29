// Carica i contenuti dimostrativi. Uso: npm run seed  (aggiungi --clips per generare brevi video di prova con ffmpeg)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { db } = require('./server');
const D = require('./seed-data');

if (db.prepare('SELECT COUNT(*) c FROM videos').get().c) { console.log('Archivio già popolato: nessuna modifica.'); process.exit(0); }
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cats = db.prepare('SELECT id FROM categories ORDER BY position').all().map((r) => r.id);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const clips = process.argv.includes('--clips');
const hues = ['#1F4E8C', '#B3261E', '#8A5A12', '#0E7C86', '#2E7D5B', '#6B3FA0'];

const progIds = D.programs.map((p, i) => db.prepare('INSERT INTO programs(name,slug,host,schedule,description,position) VALUES(?,?,?,?,?,?)')
  .run(p.name, slug(p.name), p.host, p.schedule, p.description, i).lastInsertRowid);

const now = Date.now();
const vidIds = D.videos.map((v, i) => {
  const code = `WA-2026-${String(142 - i).padStart(4, '0')}`;
  let file = null, thumb = null, mime = null, size = null;
  if (clips) {
    file = `${code}.mp4`; thumb = `${code}.jpg`; mime = 'video/mp4';
    const color = hues[v.p % hues.length].slice(1);
    const r = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=0x${color}:s=1280x720:d=8`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
      '-vf', `drawtext=text='${code}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
      path.join(DATA_DIR, 'media', file)], { stdio: 'ignore' });
    thumb = null; // le copertine grafiche generate dal sito sono più leggibili del fotogramma di prova
    if (r.status !== 0) { file = null; mime = null; }
    else {

      size = fs.statSync(path.join(DATA_DIR, 'media', file)).size;
    }
  }
  const pub = new Date(now - i * 86400000 * 1.6).toISOString().replace('T', ' ').slice(0, 19);
  return db.prepare(`INSERT INTO videos(code,title,slug,summary,description,program_id,category_id,episode,guests,tags,featured,status,published_at,views,duration,file,thumb,mime,size)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code, v.t, slug(v.t), v.s, `${v.s}\n\nOspiti: ${v.g}.`, progIds[v.p], cats[v.c], v.ep, v.g, '',
    v.f ? 1 : 0, 'published', pub, v.v, v.d, file, thumb, mime, size).lastInsertRowid;
});

D.articles.forEach((a, i) => {
  const pub = new Date(now - i * 86400000 * 2.2).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('INSERT INTO articles(title,slug,kicker,summary,body,author,category_id,video_id,status,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(a.t, slug(a.t), a.k, a.s, D.body, a.a, cats[a.c], a.v === null ? null : vidIds[a.v], 'published', pub);
});
D.schedule.forEach(([day, time, title, p]) => db.prepare('INSERT INTO schedule(day,time,title,program_id) VALUES(?,?,?,?)').run(day, time, title, p === null ? null : progIds[p]));
db.prepare(`UPDATE settings SET value='8420' WHERE key='donate_raised'`).run();
console.log(`Caricati ${D.programs.length} programmi, ${D.videos.length} video, ${D.articles.length} articoli${clips ? ' (con clip di prova)' : ''}.`);
