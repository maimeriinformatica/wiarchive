#!/bin/sh
# Prova sul proprio PC: carica .env e avvia sulla porta 8080
cd "$(dirname "$0")"
[ -d venv ] || (python3 -m venv venv && venv/bin/pip install -r requirements.txt)
set -a; . ./.env; set +a
venv/bin/waitress-serve --listen=0.0.0.0:8080 app:app
