"""Strato dati su PostgreSQL (Supabase). Connessione da DATABASE_URL."""
import os, threading
import psycopg
from psycopg.rows import dict_row
from werkzeug.security import generate_password_hash

DATABASE_URL = os.environ.get("DATABASE_URL", "")
_local = threading.local()


def conn():
    c = getattr(_local, "c", None)
    if c is None or c.closed:
        c = psycopg.connect(DATABASE_URL, row_factory=dict_row, autocommit=True, prepare_threshold=None)
        _local.c = c
    return c


def q(sql, params=(), one=False):
    try:
        cur = conn().execute(sql, params)
    except psycopg.OperationalError:
        _local.c = None  # connessione caduta: riprovo una volta
        cur = conn().execute(sql, params)
    if cur.description is None:
        return None
    return cur.fetchone() if one else cur.fetchall()


def init():
    q("""
    CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, pw TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS categories(id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS sites(
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        description TEXT DEFAULT '', max_pages INTEGER DEFAULT 200, max_depth INTEGER DEFAULT 3,
        status TEXT DEFAULT 'in attesa', note TEXT DEFAULT '', pages_done INTEGER DEFAULT 0,
        last_crawl TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS pages(
        id SERIAL PRIMARY KEY, site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
        url TEXT NOT NULL, title TEXT, text TEXT DEFAULT '', summary TEXT DEFAULT '',
        notes TEXT DEFAULT '', offline_key TEXT DEFAULT '',
        tsv tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('italian', coalesce(title,'')), 'A') ||
            setweight(to_tsvector('italian', coalesce(text,'')), 'B')) STORED,
        UNIQUE(site_id, url));
    CREATE INDEX IF NOT EXISTS pages_tsv_idx ON pages USING GIN(tsv);
    CREATE INDEX IF NOT EXISTS pages_site_idx ON pages(site_id);
    CREATE TABLE IF NOT EXISTS videos(
        id SERIAL PRIMARY KEY, title TEXT DEFAULT '', url TEXT NOT NULL,
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        description TEXT DEFAULT '', status TEXT DEFAULT 'in attesa', note TEXT DEFAULT '',
        storage_key TEXT DEFAULT '', uploader TEXT DEFAULT '', duration INTEGER DEFAULT 0,
        size_mb REAL DEFAULT 0, last_download TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now());
    """)
    if not q("SELECT 1 FROM users LIMIT 1", one=True):
        q("INSERT INTO users(username, pw, is_admin) VALUES(%s,%s,TRUE)",
          ("admin", generate_password_hash(os.environ.get("ADMIN_PASSWORD", "admin"))))
        q("INSERT INTO categories(name) VALUES('Generale') ON CONFLICT DO NOTHING")


# ---- utenti
def get_user(username):
    return q("SELECT * FROM users WHERE username=%s", (username,), one=True)

def list_users():
    return q("SELECT id, username, is_admin, created_at FROM users ORDER BY username")

def add_user(username, password, is_admin=False):
    q("INSERT INTO users(username, pw, is_admin) VALUES(%s,%s,%s) ON CONFLICT(username) DO NOTHING",
      (username, generate_password_hash(password), is_admin))

def set_password(username, password):
    q("UPDATE users SET pw=%s WHERE username=%s", (generate_password_hash(password), username))

def set_password_by_id(uid, password):
    q("UPDATE users SET pw=%s WHERE id=%s", (generate_password_hash(password), uid))

def delete_user(uid):
    q("DELETE FROM users WHERE id=%s AND is_admin=FALSE", (uid,))


# ---- categorie e siti
def list_categories():
    return q("SELECT * FROM categories ORDER BY name")

def add_category(name):
    q("INSERT INTO categories(name) VALUES(%s) ON CONFLICT DO NOTHING", (name.strip(),))

def delete_category(cid):
    q("DELETE FROM categories WHERE id=%s", (cid,))

def list_sites():
    return q("""SELECT s.*, c.name AS category,
        (SELECT COUNT(*) FROM pages p WHERE p.site_id=s.id) AS n_pages
        FROM sites s LEFT JOIN categories c ON c.id=s.category_id ORDER BY c.name NULLS LAST, s.name""")

def get_site(sid):
    return q("""SELECT s.*, c.name AS category FROM sites s
        LEFT JOIN categories c ON c.id=s.category_id WHERE s.id=%s""", (sid,), one=True)

def add_site(name, url, category_id, description, max_pages, max_depth):
    r = q("""INSERT INTO sites(name,url,category_id,description,max_pages,max_depth)
        VALUES(%s,%s,%s,%s,%s,%s) RETURNING id""", (name, url, category_id, description, max_pages, max_depth), one=True)
    return r["id"]

def update_site(sid, **kw):
    sets = ", ".join(f"{k}=%s" for k in kw)
    q(f"UPDATE sites SET {sets} WHERE id=%s", (*kw.values(), sid))

def delete_site(sid):
    q("DELETE FROM sites WHERE id=%s", (sid,))


# ---- pagine
def upsert_page(site_id, url, title, text, summary, offline_key):
    q("""INSERT INTO pages(site_id,url,title,text,summary,offline_key) VALUES(%s,%s,%s,%s,%s,%s)
        ON CONFLICT(site_id,url) DO UPDATE SET title=EXCLUDED.title, text=EXCLUDED.text,
        summary=EXCLUDED.summary, offline_key=EXCLUDED.offline_key""",
      (site_id, url, title, text, summary, offline_key))

def list_pages(site_id):
    return q("SELECT id, url, title, summary FROM pages WHERE site_id=%s ORDER BY title", (site_id,))

def get_page(pid):
    return q("SELECT * FROM pages WHERE id=%s", (pid,), one=True)

def set_notes(pid, notes):
    q("UPDATE pages SET notes=%s WHERE id=%s", (notes, pid))

def search(text, limit=50):
    return q("""SELECT p.id, p.title, p.url, s.name AS site, s.id AS site_id,
        ts_headline('italian', p.text, query, 'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') AS snip
        FROM pages p JOIN sites s ON s.id=p.site_id, websearch_to_tsquery('italian', %s) query
        WHERE p.tsv @@ query ORDER BY ts_rank(p.tsv, query) DESC LIMIT %s""", (text, limit))

def stats():
    return {"siti": q("SELECT COUNT(*) AS n FROM sites", one=True)["n"],
            "pagine": q("SELECT COUNT(*) AS n FROM pages", one=True)["n"]}


# ---- video
def list_videos():
    return q("""SELECT v.*, c.name AS category FROM videos v
        LEFT JOIN categories c ON c.id=v.category_id ORDER BY c.name NULLS LAST, v.title""")

def get_video(vid):
    return q("SELECT * FROM videos WHERE id=%s", (vid,), one=True)

def add_video(url, title, category_id, description):
    r = q("""INSERT INTO videos(url,title,category_id,description) VALUES(%s,%s,%s,%s) RETURNING id""",
          (url, title, category_id, description), one=True)
    return r["id"]

def update_video(vid, **kw):
    sets = ", ".join(f"{k}=%s" for k in kw)
    q(f"UPDATE videos SET {sets} WHERE id=%s", (*kw.values(), vid))

def delete_video(vid):
    q("DELETE FROM videos WHERE id=%s", (vid,))
