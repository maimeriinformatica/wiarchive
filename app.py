"""
Archivio privato — due aree:
  /            consultazione (tutti gli utenti con login)
  /admin/...   gestione: siti, categorie, utenti e password (solo amministratori)
"""
import os, threading, secrets
from functools import wraps
from flask import (Flask, render_template, request, redirect, url_for, session,
                   Response, abort, flash)
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash
import db, crawler, storage, videodl, videostore

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)  # Render sta dietro un proxy HTTPS
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_SECURE=bool(os.environ.get("RENDER")))
db.init()


# ------------------------------------------------------------------ accesso
def login_required(f):
    @wraps(f)
    def w(*a, **k):
        if "user" not in session:
            return redirect(url_for("login", next=request.path))
        return f(*a, **k)
    return w

def admin_required(f):
    @wraps(f)
    def w(*a, **k):
        if "user" not in session:
            return redirect(url_for("login", next=request.path))
        if not session.get("admin"):
            abort(403)
        return f(*a, **k)
    return w

@app.context_processor
def inject():
    if "user" not in session:
        return {"sites": [], "stats": {"siti": 0, "pagine": 0}}
    return {"sites": db.list_sites(), "stats": db.stats()}

@app.errorhandler(403)
def forbidden(_):
    return render_template("errore.html", msg="Questa area è riservata all'amministrazione."), 403

@app.errorhandler(404)
def notfound(_):
    return render_template("errore.html", msg="Pagina non trovata nell'archivio."), 404


@app.route("/login", methods=["GET", "POST"])
def login():
    err = None
    if request.method == "POST":
        u = db.get_user(request.form["username"].strip())
        if u and check_password_hash(u["pw"], request.form["password"]):
            session.clear()
            session["user"] = u["username"]; session["admin"] = bool(u["is_admin"])
            nxt = request.args.get("next", "")
            return redirect(nxt if nxt.startswith("/") else url_for("index"))
        err = "Nome utente o password non corretti."
    return render_template("login.html", err=err)

@app.route("/logout")
def logout():
    session.clear(); return redirect(url_for("login"))


# ------------------------------------------------------------------ consultazione
@app.route("/")
@login_required
def index():
    cats = {}
    for s in db.list_sites():
        cats.setdefault(s["category"] or "Senza categoria", []).append(s)
    return render_template("index.html", cats=cats)

@app.route("/sito/<int:sid>")
@login_required
def site(sid):
    s = db.get_site(sid) or abort(404)
    return render_template("site.html", site=s, pages=db.list_pages(sid))

@app.route("/pagina/<int:pid>", methods=["GET", "POST"])
@login_required
def page(pid):
    p = db.get_page(pid) or abort(404)
    if request.method == "POST" and session.get("admin"):
        db.set_notes(pid, request.form.get("notes", "")); p = db.get_page(pid)
    s = db.get_site(p["site_id"])
    return render_template("page.html", page=p, site=s)

@app.route("/naviga/<int:sid>")
@login_required
def browse(sid):
    s = db.get_site(sid) or abort(404)
    start = request.args.get("p") or os.path.basename(crawler.key_for(sid, s["url"], True))
    if "/" in start or ".." in start:
        abort(404)
    return render_template("naviga.html", site=s, start=start)

@app.route("/archivio/<int:sid>/<name>")
@login_required
def offline_file(sid, name):
    if "/" in name or ".." in name:
        abort(404)
    found = storage.get(f"{sid}/{name}") or abort(404)
    content, ctype = found
    # il tipo lo decide l'estensione: certi storage rispondono con un tipo
    # generico e il browser mostrerebbe il codice invece della pagina
    import mimetypes
    guessed = mimetypes.guess_type(name)[0]
    ctype = guessed or ctype or "application/octet-stream"
    if ctype.startswith("text/") and "charset" not in ctype:
        ctype += "; charset=utf-8"
    return Response(content, content_type=ctype)

@app.route("/cerca")
@login_required
def search():
    text = request.args.get("q", "").strip()
    results = db.search(text) if text else []
    return render_template("search.html", q=text, results=results)

@app.route("/videoteca")
@login_required
def videos():
    cats = {}
    for v in db.list_videos():
        cats.setdefault(v["category"] or "Senza categoria", []).append(v)
    return render_template("video.html", cats=cats)

@app.route("/videoteca/<int:vid>")
@login_required
def video(vid):
    v = db.get_video(vid) or abort(404)
    src = None
    if v["storage_key"]:
        src = videostore.url_for_player(v["storage_key"]) or url_for("video_stream", vid=vid)
    return render_template("video_player.html", v=v, src=src)

@app.route("/videoteca/<int:vid>/file")
@login_required
def video_stream(vid):
    from flask import send_file
    v = db.get_video(vid) or abort(404)
    path = videostore.local_path(v["storage_key"]) or abort(404)
    return send_file(path, conditional=True)

@app.route("/password", methods=["GET", "POST"])
@login_required
def own_password():
    if request.method == "POST":
        pw = request.form["password"]
        if len(pw) < 8:
            flash("La password deve avere almeno 8 caratteri.")
        else:
            db.set_password(session["user"], pw); flash("Password aggiornata.")
        return redirect(url_for("own_password"))
    return render_template("password.html")


# ------------------------------------------------------------------ amministrazione
@app.route("/admin")
@admin_required
def admin():
    return render_template("admin/siti.html", categories=db.list_categories())

@app.route("/admin/siti", methods=["POST"])
@admin_required
def admin_add_site():
    sid = db.add_site(request.form["name"].strip(), request.form["url"].strip(),
                      int(request.form["category_id"]), request.form.get("description", ""),
                      min(int(request.form.get("max_pages") or 200), 2000),
                      int(request.form.get("max_depth") or 3))
    threading.Thread(target=crawler.crawl_site, args=(sid,), daemon=True).start()
    flash("Sito aggiunto: lo scarico in sottofondo. Ricarica la pagina per vedere l'avanzamento.")
    return redirect(url_for("admin"))

@app.route("/admin/siti/<int:sid>/<action>", methods=["POST"])
@admin_required
def admin_site(sid, action):
    s = db.get_site(sid) or abort(404)
    if action == "aggiorna":
        threading.Thread(target=crawler.crawl_site, args=(sid,), daemon=True).start()
        flash(f"Aggiornamento di «{s['name']}» avviato.")
    elif action == "elimina":
        storage.delete_prefix(f"{sid}/")
        db.delete_site(sid); flash(f"«{s['name']}» eliminato dall'archivio.")
    return redirect(url_for("admin"))

@app.route("/admin/video", methods=["GET", "POST"])
@admin_required
def admin_videos():
    if request.method == "POST":
        vid = db.add_video(request.form["url"].strip(), request.form.get("title", "").strip(),
                           int(request.form["category_id"]), request.form.get("description", ""))
        threading.Thread(target=videodl.download_video, args=(vid,), daemon=True).start()
        flash("Video aggiunto: lo scarico in sottofondo. Ricarica per vedere l'avanzamento.")
        return redirect(url_for("admin_videos"))
    return render_template("admin/video.html", videos=db.list_videos(), categories=db.list_categories())

@app.route("/admin/video/<int:vid>/<action>", methods=["POST"])
@admin_required
def admin_video(vid, action):
    v = db.get_video(vid) or abort(404)
    if action == "riprova":
        threading.Thread(target=videodl.download_video, args=(vid,), daemon=True).start()
        flash("Scarico riavviato.")
    elif action == "elimina":
        if v["storage_key"]:
            videostore.delete(v["storage_key"])
        db.delete_video(vid); flash("Video eliminato dall'archivio.")
    return redirect(url_for("admin_videos"))

@app.route("/admin/categorie", methods=["GET", "POST"])
@admin_required
def admin_categories():
    if request.method == "POST":
        if request.form.get("delete"):
            db.delete_category(int(request.form["delete"]))
        elif request.form.get("name", "").strip():
            db.add_category(request.form["name"])
        return redirect(url_for("admin_categories"))
    return render_template("admin/categorie.html", categories=db.list_categories())

@app.route("/admin/utenti", methods=["GET", "POST"])
@admin_required
def admin_users():
    if request.method == "POST":
        act = request.form.get("act")
        if act == "crea":
            u, pw = request.form["username"].strip(), request.form["password"]
            if not u or len(pw) < 8:
                flash("Serve un nome utente e una password di almeno 8 caratteri.")
            else:
                db.add_user(u, pw, bool(request.form.get("is_admin")))
                flash(f"Utente «{u}» creato. Comunicagli la password che hai scelto.")
        elif act == "password":
            db.set_password_by_id(int(request.form["uid"]), request.form["password"])
            flash("Password dell'utente aggiornata.")
        elif act == "elimina":
            db.delete_user(int(request.form["uid"]))
        return redirect(url_for("admin_users"))
    return render_template("admin/utenti.html", users=db.list_users())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), threaded=True)
