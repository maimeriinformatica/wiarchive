# WIARCHIVE — piattaforma di divulgazione video

TV e archivio video indipendente: home a palinsesto, pagine video con player, programmi e rubriche, diretta con palinsesto settimanale, notizie/approfondimenti, pagina "Sostienici" con impegni di sostegno e newsletter. Area redazione su `/admin`.

## Avvio in locale
```bash
npm install
npm run seed         # contenuti dimostrativi (facoltativo)
npm run seed:clips   # come sopra, con brevi clip video di prova (serve ffmpeg)
npm start            # http://localhost:3000   — redazione: http://localhost:3000/admin
```
Accesso iniziale: `admin@wiarchive.local` / `wiarchive2026` (oppure le variabili `ADMIN_EMAIL` / `ADMIN_PASSWORD` al primo avvio). **Cambia la password** da Impostazioni.

## Pubblicazione su Render
1. Carica la cartella su un repository GitHub.
2. Su Render: *New → Blueprint* e scegli il repository: `render.yaml` crea il servizio con disco persistente da 50 GB montato su `/var/data` (video, copertine, database).
3. Imposta `ADMIN_EMAIL` e `ADMIN_PASSWORD`, poi collega il dominio (es. wiarchive.it).

Il disco persistente è indispensabile: senza, i video caricati si perdono a ogni riavvio. Aumenta `sizeGB` in base all'archivio (circa 1 GB ogni ora di video 1080p).

## Come funziona
| Parte | Dettagli |
|---|---|
| Server | Node.js + Express 5, database SQLite (`better-sqlite3`) in `DATA_DIR` |
| Video | caricamento dalla redazione (MP4/WebM/MOV, fino a `MAX_UPLOAD_MB`), streaming con richieste *Range* (avanzamento veloce nel player) |
| ffmpeg | se presente sul server ricava durata e copertina automatica; altrimenti la copertina è generata graficamente dal sito |
| Segnatura | ogni video riceve un codice d'archivio `WA-AAAA-NNNN` |
| Diretta | si trasmette da OBS verso un servizio di streaming (Owncast, Cloudflare Stream, Mux…) e si incolla in redazione l'indirizzo `.m3u8`; il player usa hls.js |
| Sostegno | IBAN, link PayPal e obiettivo configurabili; i moduli registrano gli impegni (nessun pagamento online incorporato) |
| Utenti | ruoli Amministratore e Redattore |

## Radar notizie (alimentazione automatica)
Il Radar legge a intervalli regolari le fonti configurate (feed RSS/Atom e canali video), riconosce la **stessa notizia raccontata da testate diverse** e conta le conferme indipendenti (le fonti dello stesso proprietario valgono una sola conferma).

- **Redazione → Fonti del Radar**: 22 fonti consigliate già inserite (Italia, Europa, Americhe, Asia, Africa, Medio Oriente, più tre canali video). Il pulsante *Prova* verifica subito se un feed risponde; aggiungi le testate che vuoi.
- **Uso dei contenuti** per ogni fonte: *estratto + collegamento* (testate con diritti riservati, compresa Byoblu), *video incorporato* con il player ufficiale, *testo completo* solo con licenza libera (es. Global Voices, CC BY) o accordo scritto.
- **Redazione → Radar notizie**: attiva la raccolta automatica, scegli ogni quanti minuti, e se vuoi la **pubblicazione automatica** delle notizie confermate da almeno N testate indipendenti (predefinito 3, dopo 60 minuti di attesa per raccogliere più versioni).
- **Verifica incrociata con AI** (facoltativa, variabile `ANTHROPIC_API_KEY`): traduce e confronta notizie in lingue diverse e scrive una scheda neutra in tre parti — fatti confermati da più fonti, versioni divergenti, affermazioni di una sola fonte da verificare — sempre con i numeri delle fonti. Senza chiave, la scheda elenca come ogni testata riporta la notizia.

Ogni articolo del Radar porta l'elenco delle fonti con i collegamenti agli originali e il badge “N fonti a confronto”.

## Crescita consigliata
- Molti video o molto traffico: spostare i file su uno storage a oggetti (Cloudflare R2, Backblaze B2 o Supabase Storage) con CDN.
- Transcodifica in più qualità (HLS adattivo) con ffmpeg o un servizio esterno.
- Pagamenti ricorrenti: integrare Stripe o PayPal Subscriptions.

`npm run build:demo` rigenera la demo divulgabile (`proto/wiarchive-demo.html`): sito e redazione funzionanti interamente nel browser, con i contenuti di prova del database.
