"""
Crawler dell'archivio: scarica un sito entro il suo dominio e salva
1) il testo pulito di ogni pagina nel database (wiki + ricerca)
2) una copia completa navigabile offline nello storage, come file piatti
   <id_sito>/<hash-url>.<ext>, con i link riscritti tra loro.
"""
import os, re, time, hashlib, threading, urllib.robotparser
from urllib.parse import urljoin, urlparse, urldefrag
from collections import deque

import requests
from bs4 import BeautifulSoup
import trafilatura

import db, storage

UA = "ArchivioPrivato/1.0 (+crawler personale)"
ASSET_ATTRS = {"img": "src", "script": "src", "link": "href", "source": "src", "video": "src", "audio": "src"}
SKIP_EXT = (".zip", ".exe", ".mp4", ".mp3", ".iso", ".rar", ".7z", ".dmg", ".pdf")
MAX_ASSET = 15_000_000
_lock = threading.Lock()
_running = set()


def key_for(site_id, url, is_html=False):
    """Chiave di storage di un URL: <sito>/<md5>.<ext>"""
    url = urldefrag(url)[0]
    ext = os.path.splitext(urlparse(url).path)[1].lower()
    if is_html or not ext or len(ext) > 6:
        ext = ".html"
    return f"{site_id}/{hashlib.md5(url.encode()).hexdigest()}{ext}"


def crawl_site(site_id):
    """Scarica il sito indicato. Pensato per girare in un thread separato."""
    with _lock:
        if site_id in _running:
            return
        _running.add(site_id)
    try:
        _crawl(site_id)
    except Exception as e:  # noqa
        db.update_site(site_id, status="errore", note=str(e)[:300])
    finally:
        with _lock:
            _running.discard(site_id)


def _crawl(site_id):
    site = db.get_site(site_id)
    start = site["url"]
    max_pages = site["max_pages"] or 200
    depth_max = site["max_depth"] if site["max_depth"] is not None else 3
    domain = urlparse(start).netloc

    rp = urllib.robotparser.RobotFileParser()
    try:
        rp.set_url(f"{urlparse(start).scheme}://{domain}/robots.txt"); rp.read()
    except Exception:
        rp = None

    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    db.update_site(site_id, status="in corso", note="", pages_done=0)

    queue = deque([(start, 0)])
    seen_keys = {key_for(site_id, start, True)}
    assets_done = set()
    n = 0

    while queue and n < max_pages:
        url, depth = queue.popleft()
        if rp and not rp.can_fetch(UA, url):
            continue
        try:
            r = sess.get(url, timeout=20)
        except Exception:
            continue
        ctype = r.headers.get("content-type", "")
        if "text/html" not in ctype or r.status_code != 200:
            continue
        if "charset" not in ctype:
            r.encoding = r.apparent_encoding or "utf-8"
        html = r.text
        soup = BeautifulSoup(html, "html.parser")
        title = (soup.title.string.strip() if soup.title and soup.title.string else url)[:200]

        # --- 1. testo pulito per la wiki
        text = trafilatura.extract(html, url=url, include_links=False, include_tables=True) or ""
        summary = re.sub(r"\s+", " ", text)[:300]
        page_key = key_for(site_id, url, True)

        # --- 2. copia offline: asset dello stesso dominio, link riscritti
        for tag, attr in ASSET_ATTRS.items():
            for el in soup.find_all(tag):
                src = el.get(attr)
                if not src or src.startswith(("data:", "#", "mailto:", "javascript:")):
                    continue
                rel = " ".join(el.get("rel") or [])
                if tag == "link" and "stylesheet" not in rel and "icon" not in rel:
                    continue
                full = urldefrag(urljoin(url, src))[0]
                if urlparse(full).netloc != domain:
                    continue
                akey = key_for(site_id, full)
                if full not in assets_done:
                    assets_done.add(full)
                    try:
                        ar = sess.get(full, timeout=20)
                        if ar.status_code == 200 and len(ar.content) < MAX_ASSET:
                            storage.put(akey, ar.content)
                    except Exception:
                        pass
                el[attr] = os.path.basename(akey)
                if el.has_attr("srcset"):
                    del el["srcset"]

        for a in soup.find_all("a", href=True):
            full = urldefrag(urljoin(url, a["href"]))[0]
            p = urlparse(full)
            if p.scheme not in ("http", "https"):
                continue
            if p.netloc == domain and not full.lower().endswith(SKIP_EXT):
                k = key_for(site_id, full, True)
                a["href"] = os.path.basename(k)
                if k not in seen_keys and depth < depth_max:
                    seen_keys.add(k)
                    queue.append((full, depth + 1))
            else:
                a["target"] = "_blank"

        for base in soup.find_all("base"):
            base.decompose()
        banner = soup.new_tag("div", style="background:#1C2430;color:#fff;padding:6px 12px;font:13px sans-serif")
        banner.string = f"Copia d'archivio di {url} — scaricata il {time.strftime('%d/%m/%Y')}"
        if soup.body:
            soup.body.insert(0, banner)
        storage.put(page_key, str(soup).encode("utf-8"))
        db.upsert_page(site_id, url, title, text, summary, page_key)

        n += 1
        db.update_site(site_id, pages_done=n)
        time.sleep(0.5)

    db.update_site(site_id, status="completato", pages_done=n,
                   last_crawl=time.strftime("%Y-%m-%d %H:%M"))
