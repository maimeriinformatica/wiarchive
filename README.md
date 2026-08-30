# Archivio privato — wiki di siti scaricati

Applicazione web che scarica i siti che indichi e li conserva in due forme:

- **testo pulito**, organizzato per categoria e consultabile come una wiki, con ricerca a tutto testo (in italiano) e note dell'archivista;
- **copia completa navigabile offline** (HTML, immagini, CSS) con i link riscritti, apribile dalla pagina wiki.

Due aree, entrambe dietro login:

| Area | Chi | Cosa fa |
|---|---|---|
| `/` consultazione | tutti gli utenti | naviga categorie, siti, pagine; cerca; cambia la propria password |
| `/admin` amministrazione | solo amministratori | aggiunge/aggiorna/elimina siti, gestisce categorie, crea utenti e assegna le password |

Architettura: **GitHub** (codice) → **Render** (esecuzione) → **Supabase** (database Postgres + Storage per le copie offline). Render cancella i file locali a ogni riavvio, per questo i dati vivono tutti su Supabase.

## Messa online (una volta sola, ~15 minuti)

### 1. Supabase
1. Crea un progetto su supabase.com e annota la **password del database**.
2. *Project Settings → Database → Connection string*: scegli **Session pooler** (porta 5432, non 6543) e copia l'URI. Sostituisci `[YOUR-PASSWORD]`. Questo è `DATABASE_URL`.
3. *Project Settings → API*: copia **Project URL** (`SUPABASE_URL`) e la chiave **service_role** (`SUPABASE_SERVICE_KEY`). Non usare la chiave `anon`.
4. *Storage → New bucket*: nome `archivio`, **privato** (non pubblico). Le tabelle del database si creano da sole al primo avvio.

### 2. GitHub
Crea un repository (anche privato) e caricaci tutti i file di questa cartella. Il file `.gitignore` esclude già `data/`, `venv/` e `.env`.

### 3. Render
1. *New → Blueprint*, collega il repository: Render legge `render.yaml`.
2. Ti chiede i valori delle variabili: incolla `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e scegli `ADMIN_PASSWORD` (la password iniziale dell'utente `admin`). `SECRET_KEY` viene generata da Render.
3. Deploy. Da quel momento ogni `git push` ridistribuisce in automatico.

Apri l'indirizzo `https://….onrender.com`, entra con `admin` e la password scelta, vai su *Gestione* e comincia.

### Note su Render
- Il piano **free** spegne l'app dopo 15 minuti senza visite: il primo accesso successivo impiega ~30 secondi, e uno scarico in corso si interrompe se nessuno tiene aperta la pagina. Per archivi grandi conviene il piano Starter (≈7 $/mese) o tenere `Massimo pagine` basso e lanciare gli scarichi mentre si consulta.
- Render è dietro un proxy HTTPS: l'app è già configurata per questo (`ProxyFix`, cookie `Secure`).

## Prova sul proprio PC
Copia `.env.example` in `.env`, compila i valori (puoi usare lo stesso Supabase) e lancia `./avvia-locale.sh` (Linux/Mac) oppure, su Windows, imposta le variabili e `waitress-serve --listen=0.0.0.0:8080 app:app`. Senza `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` le copie offline finiscono in `data/archive/` (solo per test; il database Postgres resta obbligatorio).

## Uso quotidiano
1. **Gestione → Categorie**: crea le sezioni della wiki.
2. **Gestione → Siti**: nome, indirizzo, categoria, massimo pagine, profondità. Lo scarico parte in sottofondo; *Aggiorna* lo ripete, *Elimina* toglie tutto (anche dallo Storage).
3. **Gestione → Utenti**: crea l'accesso e scegli la password, poi comunicala alla persona. Spunta *Amministratore* solo per chi deve gestire. Da qui puoi reimpostare la password di chiunque o togliere un accesso.
4. Ogni utente cambia la propria password dal link *Password* in basso nel menù.

## Come funziona lo scarico
- Il crawler resta nel dominio di partenza, rispetta `robots.txt`, attende mezzo secondo tra le pagine, salta i file pesanti (video, zip, pdf).
- I siti costruiti interamente in JavaScript vengono scaricati solo per la parte presente nell'HTML iniziale.
- I contenuti scaricati restano di chi li ha pubblicati: l'archivio è pensato per consultazione riservata. Verifica le condizioni d'uso dei siti prima di distribuirli a terzi.

## File
`app.py` rotte e accesso · `db.py` Postgres · `storage.py` Supabase Storage (o cartella locale) · `crawler.py` scarico · `templates/` pagine (`templates/admin/` area amministrativa) · `static/style.css`
