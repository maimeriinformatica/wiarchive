"""
Scarico dei video: yt-dlp prende il link (YouTube, Vimeo, link diretti a .mp4, …),
scarica in una cartella temporanea e il file finisce nello storage video.
Formato a file unico (niente ffmpeg necessario), qualità fino a 720p di default.
"""
import os, tempfile, threading, time, shutil

import db, videostore

MAX_MB = int(os.environ.get("VIDEO_MAX_MB", "1500"))
QUALITY = os.environ.get("VIDEO_MAX_HEIGHT", "720")
_lock = threading.Lock()
_running = set()


def download_video(vid):
    with _lock:
        if vid in _running:
            return
        _running.add(vid)
    try:
        _download(vid)
    except Exception as e:  # noqa
        db.update_video(vid, status="errore", note=str(e)[:300])
    finally:
        with _lock:
            _running.discard(vid)


def _download(vid):
    import yt_dlp
    v = db.get_video(vid)
    db.update_video(vid, status="in corso", note="")
    tmp = tempfile.mkdtemp(prefix="video_")
    try:
        opts = {
            "outtmpl": os.path.join(tmp, "%(id)s.%(ext)s"),
            "format": f"best[ext=mp4][height<={QUALITY}]/best[height<={QUALITY}]/best",
            "noplaylist": True,
            "max_filesize": MAX_MB * 1024 * 1024,
            "quiet": True, "no_warnings": True,
            "socket_timeout": 30,
        }
        with yt_dlp.YoutubeDL(opts) as y:
            info = y.extract_info(v["url"], download=True)
        files = [os.path.join(tmp, f) for f in os.listdir(tmp)]
        if not files:
            raise RuntimeError(f"nessun file scaricato (video più grande di {MAX_MB} MB o non raggiungibile)")
        path = max(files, key=os.path.getsize)
        size_mb = round(os.path.getsize(path) / 1048576, 1)
        ext = os.path.splitext(path)[1] or ".mp4"
        key = f"video/{vid}{ext}"
        ctype = "video/webm" if ext == ".webm" else "video/mp4"
        videostore.put_file(key, path, ctype)

        title = v["title"] or (info.get("title") or "")[:200]
        db.update_video(vid, status="pronto", storage_key=key, title=title or "Video",
                        uploader=(info.get("uploader") or info.get("channel") or "")[:120],
                        duration=int(info.get("duration") or 0),
                        size_mb=size_mb,
                        last_download=time.strftime("%Y-%m-%d %H:%M"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
