"""
Dove finiscono le copie offline.
- Con SUPABASE_URL + SUPABASE_SERVICE_KEY impostati → bucket Supabase Storage (persistente, adatto a Render).
- Altrimenti → cartella locale data/archive (solo per prove sul proprio PC).
"""
import os, mimetypes, requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BUCKET = os.environ.get("SUPABASE_BUCKET", "archivio")
LOCAL_DIR = os.path.join(os.path.dirname(__file__), "data", "archive")
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)
_headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}


def put(key, content):
    """Salva bytes sotto la chiave (es. '1/www.sito.it/guide/pagina.html')."""
    if USE_SUPABASE:
        ctype = mimetypes.guess_type(key)[0] or "application/octet-stream"
        r = requests.post(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}", data=content,
                          headers={**_headers, "Content-Type": ctype, "x-upsert": "true"}, timeout=60)
        if r.status_code >= 400:
            raise RuntimeError(f"Storage {r.status_code} su {BUCKET}/{key}: {r.text[:200]}")
    else:
        path = os.path.join(LOCAL_DIR, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(content)


def get(key):
    """Restituisce (bytes, content_type) oppure None."""
    if USE_SUPABASE:
        r = requests.get(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}", headers=_headers, timeout=60)
        if r.status_code != 200:
            return None
        return r.content, r.headers.get("content-type") or mimetypes.guess_type(key)[0] or "application/octet-stream"
    path = os.path.join(LOCAL_DIR, key)
    if not os.path.isfile(path):
        return None
    return open(path, "rb").read(), mimetypes.guess_type(key)[0] or "application/octet-stream"


def delete_prefix(prefix):
    """Elimina tutte le copie offline di un sito."""
    if USE_SUPABASE:
        while True:
            r = requests.post(f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}",
                              json={"prefix": prefix, "limit": 1000}, headers=_headers, timeout=60)
            names = [prefix + o["name"] for o in r.json()] if r.ok else []
            if not names:
                break
            requests.delete(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}",
                            json={"prefixes": names}, headers=_headers, timeout=60)
            if len(names) < 1000:
                break
    else:
        import shutil
        shutil.rmtree(os.path.join(LOCAL_DIR, prefix), ignore_errors=True)
