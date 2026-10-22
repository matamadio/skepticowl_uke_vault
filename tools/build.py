#!/usr/bin/env python3
"""Genera il sito di Skepticowl's song vault a partire da una cartella di .txt.

Uso:
    python tools/build.py "X:\\Dropbox\\Public\\Uke"
    python tools/build.py SORGENTE --sottocartelle
    python tools/build.py SORGENTE --out CARTELLA_DEL_REPO

Cosa fa:
  * prende i file .txt della cartella sorgente e quelli delle "sezioni"
    elencate in config.json (es. cazzate/, senza le sue sottocartelle); le
    altre sottocartelle sono escluse, a meno di usare --sottocartelle (tutto
    il resto, pdf/docx/gp5/midi/immagini/.lnk..., viene ignorato, come le
    cartelle che iniziano con un punto);
  * riconosce la codifica (UTF-16 con BOM, UTF-8 con o senza BOM, altrimenti
    cp1252) e riscrive tutto in UTF-8 senza BOM, lasciando intatti spazi e
    tab: l'unica modifica e' CRLF -> LF;
  * ricrea da zero la cartella songs/ del repository e scrive songs.json;
  * i file il cui nome inizia con _ vengono sempre esclusi;
  * copia i PDF della cartella dei canzonieri (config.json) in canzonieri/,
    tranne quelli esclusi, e scrive canzonieri.json.

Solo libreria standard, Python 3.9+.
"""

import argparse
import codecs
import collections
import datetime
import difflib
import fnmatch
import hashlib
import json
import os
import re
import shutil
import sys
import unicodedata

# " - " o " – " (trattino medio); accettato anche "Artista- Titolo"
SEPARATOR = re.compile(r"\s+[-\u2013]\s+|(?<=\S)[-\u2013]\s+")


def _latin1_fallback(err):
    # cp1252 non definisce 0x81, 0x8D, 0x8F, 0x90, 0x9D: li si legge come latin-1
    return err.object[err.start:err.end].decode("latin-1"), err.end


codecs.register_error("latin1fallback", _latin1_fallback)


def decode(data):
    """Restituisce (testo, nome_codifica)."""
    if data.startswith(codecs.BOM_UTF16_LE):
        return data[2:].decode("utf-16-le", errors="replace"), "utf-16-le"
    if data.startswith(codecs.BOM_UTF16_BE):
        return data[2:].decode("utf-16-be", errors="replace"), "utf-16-be"
    if data.startswith(codecs.BOM_UTF8):
        return data[3:].decode("utf-8", errors="replace"), "utf-8-bom"
    # UTF-16 senza BOM: tanti byte nulli in posizione dispari (testo latino)
    if len(data) >= 4:
        odd_nulls = data[1::2].count(0)
        even_nulls = data[0::2].count(0)
        if odd_nulls > len(data) // 4 and even_nulls < len(data) // 50:
            return data.decode("utf-16-le", errors="replace"), "utf-16-le"
        if even_nulls > len(data) // 4 and odd_nulls < len(data) // 50:
            return data.decode("utf-16-be", errors="replace"), "utf-16-be"
    try:
        text = data.decode("utf-8")
        return text, "ascii" if data.isascii() else "utf-8"
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="latin1fallback"), "cp1252"


def split_name(stem):
    """'Artista - Titolo' -> ('Artista', 'Titolo'); senza separatore artista vuoto."""
    m = SEPARATOR.search(stem)
    if not m or m.start() == 0:
        return "", stem.strip()
    artist, title = stem[:m.start()].strip(), stem[m.end():].strip()
    if not title:
        return "", stem.strip()
    return artist, title


def fold(s):
    """Minuscolo e senza accenti (come la ricerca dell'app)."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower()


# ---------- Accordi ----------
# Un accordo e' una parola isolata (tra spazi) oppure tra parentesi quadre [Am].
SUFFIX = (
    r"(?:maj|min|m|M|dim|aug|sus|add|\+|°|ø)?"     # qualita'
    r"(?:\d{1,2})?"                                 # 7, 9, 11, 13, 5, 6...
    r"(?:(?:maj|sus|add|aug|dim|b|#|\+)\d{0,2}|-\d{1,2})*"
    r"(?:\([^)\s]{1,8}\))?")                         # (b9), (add9)...
ROOT_EN = r"[A-G](?:#|b)?"
ROOT_IT = r"(?:Do|Re|Mi|Fa|Sol|La|Si)(?:#|b)?"    # notazione italiana
CHORD = re.compile(ROOT_EN + SUFFIX + r"(?:/" + ROOT_EN + r")?")
CHORD_IT = re.compile(ROOT_IT + SUFFIX + r"(?:/" + ROOT_IT + r")?")
BRACKETED = re.compile(r"\[([^\]\s]{1,16})\]")
TAB_LINE = re.compile(r"^\s*[A-Ga-g][#b]?\s*[|:]?-*[|:]?[-0-9hpbr/\\~x|]{4,}")
# Diteggiature scritte nel file, es. "Am7 0000", "G9: 4555", "G#=5046", "Fsus (2013)"
SHAPE = re.compile(r"(?:^|[\s(,;])(" + CHORD.pattern + r")[ \t]*[:=]?[ \t]*\(?([0-9xX]{4})\)?(?=$|[\s),;])")
# Parole isolate ambigue: accordo solo se la riga e' fatta (quasi) solo di accordi
AMBIGUOUS = {"A", "E"}
NOISE = re.compile(r"^(?:x\d+|\d+x|[-|/.:%*]+|\(?x?\d+\)?|n\.?c\.?|\d{4})$", re.I)


def find_chords(text):
    """Accordi in ordine di prima apparizione + diteggiature dichiarate nel file.
    Restituisce (accordi, forme, incerti); incerti = parole isolate trovate in
    righe di testo (non di soli accordi), da controllare."""
    found, shapes, doubtful = {}, {}, set()
    for line in text.split("\n"):
        for m in SHAPE.finditer(line):
            shapes.setdefault(m.group(1), m.group(2).lower())
        for m in BRACKETED.finditer(line):
            if CHORD.fullmatch(m.group(1)):
                found.setdefault(m.group(1), len(found))
        if TAB_LINE.match(line):
            continue
        rest = BRACKETED.sub(" ", line)
        tokens = [t if CHORD.fullmatch(t) else t.strip("()[],;!?.") for t in re.split(r"[\s|]+", rest) if t]
        tokens = [t for t in tokens if t and not NOISE.match(t)]
        if not tokens:
            continue
        chords = [t for t in tokens if CHORD.fullmatch(t)]
        ita = [t for t in tokens if CHORD_IT.fullmatch(t)]
        chord_line = len(chords) + len(ita) >= 0.6 * len(tokens)
        if chord_line:  # Do, Re, La... sono anche parole: solo nelle righe di accordi
            chords = [t for t in tokens if t in chords or t in ita]
        for c in chords:
            if chord_line:
                found.setdefault(c, len(found))
            elif c not in AMBIGUOUS and len(c) > 1:
                # parola isolata dentro il testo (es. "... la luna Am ...")
                found.setdefault(c, len(found))
                doubtful.add(c)
    return sorted(found, key=found.get), shapes, doubtful


# ---------- Tag ----------
EASY_CHORDS = {"C", "G", "Am", "F", "D", "Em", "A", "Dm", "E7", "G7", "A7", "C7", "D7",
               "Do", "Sol", "Lam", "Fa", "Re", "Mim", "La", "Rem", "Mi7", "Sol7", "La7", "Do7", "Re7"}


def is_instrumental(text):
    """Quasi senza testo: al massimo 3 righe con 4+ parole che non sono accordi."""
    lyric = 0
    for line in text.split("\n"):
        if TAB_LINE.match(line):
            continue
        words = [w for w in re.findall(r"[^\W\d_]{3,}", line)
                 if not CHORD.fullmatch(w) and not CHORD_IT.fullmatch(w)]
        if len(words) >= 4:
            lyric += 1
            if lyric > 3:
                return False
    return True


def is_easy(chords):
    return 0 < len(chords) <= 5 and set(chords) <= EASY_CHORDS


def load_tags(path):
    """tags.json -> lista ordinata di (nome, regole) con chiavi gia' normalizzate."""
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    out = []
    for name, spec in raw.items():
        if name.startswith("_") or not isinstance(spec, dict):
            continue
        out.append((name, {
            "artisti": {artist_key(a): a for a in spec.get("artisti", [])},
            "canzoni": {fold(c.strip()) for c in spec.get("canzoni", [])},
            "cartelle": {c.casefold() for c in spec.get("cartelle", [])},
            "escludi": {fold(c.strip()) for c in spec.get("escludi", [])},
            "auto": spec.get("auto", ""),
        }))
    return out


def search_text(text):
    """Testo compatto per la ricerca full-text: niente accenti, niente simboli."""
    return " ".join(re.sub(r"[^\w']+", " ", fold(text)).split())


def artist_key(name):
    """Chiave per riconoscere lo stesso artista scritto in modi diversi:
    maiuscole, accenti, spazi, punteggiatura, "The" davanti (o ", The" in
    fondo) e "&" al posto di "and" non contano."""
    k = fold(name).replace("&", " and ")
    k = re.sub(r"^\s*the\s+|,\s*the\s*$", "", k)
    return re.sub(r"[\W_]+", "", k) or fold(name)


def clean_artist(name):
    """Spazi doppi, tab e spazi ai lati via."""
    return " ".join(name.split())


def pick_spelling(counter):
    """Grafia da mostrare: meglio non tutta minuscola e senza ", The" in fondo;
    poi la piu' usata; a parita' quella con accenti, poi la piu' lunga."""
    def rank(kv):
        name, n = kv
        return (name == name.lower(), bool(re.search(r",\s*the\s*$", name, re.I)),
                -n, name.isascii(), -len(name), name)
    return min(counter.items(), key=rank)[0]


def load_aliases(path):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return {
        artist_key(k): clean_artist(v)
        for k, v in raw.items()
        if not k.startswith("_") and isinstance(v, str)
    }


# Video YouTube: il primo link trovato nel file, oppure quello in videos.json
YOUTUBE = re.compile(r"(?:youtube\.com/(?:watch\?(?:[^\s#]*?&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")


def youtube_id(text):
    m = YOUTUBE.search(text or "")
    if m:
        return m.group(1)
    t = (text or "").strip()
    return t if re.fullmatch(r"[A-Za-z0-9_-]{11}", t) else ""


def load_videos(path):
    """videos.json: nome del file (senza .txt) -> link YouTube (o id del video)."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return {fold(k.strip()): youtube_id(v) for k, v in raw.items()
            if not k.startswith("_") and isinstance(v, str)}


def load_song_artists(path):
    """song_artists.json: nome del file (senza .txt) -> artista, per i file
    senza " - " nel nome. Maiuscole e accenti non contano."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return {
        fold(k.strip()): clean_artist(v)
        for k, v in raw.items()
        if not k.startswith("_") and isinstance(v, str)
    }


def song_id(rel_path):
    """Id stabile: dipende solo dal percorso relativo (senza maiuscole)."""
    return hashlib.sha1(rel_path.casefold().encode("utf-8")).hexdigest()[:10]


def is_inside(path, folder):
    """True se path e' folder o sta dentro folder (dischi diversi su Windows: no)."""
    try:
        return os.path.commonpath([os.path.normcase(path), os.path.normcase(folder)]) == os.path.normcase(folder)
    except ValueError:  # es. X:\ e C:\ su Windows
        return False


def load_config(path):
    config = {"sezioni": ["cazzate"], "sezioni_nascoste": ["cazzate"],
              "canzonieri": "canzonieri", "canzonieri_esclusi": []}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            config.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    return config


def collect(source, recursive, sections):
    """I .txt della cartella principale e delle sezioni (non delle loro
    sottocartelle); con recursive tutti."""
    sections = {d.casefold() for d in sections}
    found, ignored, skipped_dirs = [], collections.Counter(), []
    for root, dirs, files in os.walk(source):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        if not recursive:
            top = os.path.normcase(root) == os.path.normcase(source)
            keep = [d for d in dirs if top and d.casefold() in sections]
            rel = os.path.relpath(root, source).replace(os.sep, "/")
            skipped_dirs += [d if top else rel + "/" + d for d in dirs if d not in keep]
            dirs[:] = keep
        for name in sorted(files):
            ext = os.path.splitext(name)[1].lower()
            if name.startswith("_"):
                ignored["file che iniziano con _"] += 1
            elif ext == ".txt" and not name.startswith("."):
                found.append(os.path.join(root, name))
            else:
                ignored[ext or "(senza estensione)"] += 1
    return found, ignored, skipped_dirs


def file_hash(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:8]


def build_songbooks(source, out, folder, excluded):
    """Copia i PDF di SORGENTE/<folder> (solo il primo livello) in canzonieri/
    e scrive canzonieri.json. Restituisce (copiati, esclusi, troppo_grandi)."""
    out_dir = os.path.join(out, "canzonieri")
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    src_dir = None
    if folder and os.path.isdir(source):
        for d in os.listdir(source):
            if d.casefold() == folder.casefold() and os.path.isdir(os.path.join(source, d)):
                src_dir = os.path.join(source, d)
    items, skipped, too_big = [], [], []
    patterns = [p.casefold() for p in excluded]
    for name in sorted(os.listdir(src_dir) if src_dir else [], key=str.casefold):
        src = os.path.join(src_dir, name)
        stem, ext = os.path.splitext(name)
        if ext.lower() != ".pdf" or not os.path.isfile(src):
            continue
        if name.startswith("_"):
            skipped.append(name)
            continue
        if any(fnmatch.fnmatch(name.casefold(), p) or fnmatch.fnmatch(stem.casefold(), p) for p in patterns):
            skipped.append(name)
            continue
        size = os.path.getsize(src)
        if size > 95 * 1024 * 1024:  # GitHub rifiuta i file oltre 100 MB
            too_big.append(name)
            continue
        os.makedirs(out_dir, exist_ok=True)
        shutil.copyfile(src, os.path.join(out_dir, name))
        mtime = datetime.datetime.fromtimestamp(os.stat(src).st_mtime, datetime.timezone.utc)
        items.append({
            "id": song_id("canzonieri/" + name),
            "title": stem.strip(),
            "path": name,
            "size": size,
            "mtime": mtime.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "h": file_hash(src),
        })
    with open(os.path.join(out, "canzonieri.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"items": items}, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    return items, skipped, too_big


def stamp_assets(out):
    """Mette in index.html ?v=<hash> su app.js e style.css: il browser non
    puo' cosi' mescolare una pagina nuova con file vecchi in cache."""
    path = os.path.join(out, "index.html")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        html = f.read()
    new = html
    for name in ("app.js", "chords.js", "style.css"):
        p = os.path.join(out, name)
        if os.path.exists(p):
            v = file_hash(p)
            new = re.sub(r'(["\'])' + re.escape(name) + r'(?:\?v=[\w]*)?\1', r"\g<1>%s?v=%s\g<1>" % (name, v), new)
    if new != html:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(new)


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("source", help="cartella con i .txt (es. X:\\Dropbox\\Public\\Uke)")
    ap.add_argument("--sottocartelle", action="store_true",
                    help="includi anche i .txt delle sottocartelle (normalmente escluse)")
    ap.add_argument("--out", default=repo, help="cartella del sito (predefinita: il repository)")
    args = ap.parse_args(argv)

    source = os.path.abspath(args.source)
    out = os.path.abspath(args.out)
    songs_dir = os.path.join(out, "songs")
    if not os.path.isdir(source):
        sys.exit("Cartella sorgente non trovata: %s" % source)
    for d in (songs_dir, os.path.join(out, "canzonieri")):
        if is_inside(source, d):
            sys.exit("La sorgente non puo' stare dentro %s" % d)

    aliases = load_aliases(os.path.join(out, "artists.json"))
    song_artists = load_song_artists(os.path.join(out, "song_artists.json"))
    videos = load_videos(os.path.join(out, "videos.json"))
    config = load_config(os.path.join(out, "config.json"))
    stamp_assets(out)
    files, ignored, skipped_dirs = collect(source, args.sottocartelle, config["sezioni"])
    books, books_skipped, books_big = build_songbooks(
        source, out, config["canzonieri"], config["canzonieri_esclusi"])

    if os.path.isdir(songs_dir):
        shutil.rmtree(songs_dir)

    songs, encodings, ids = [], collections.Counter(), {}
    chord_doubts = collections.defaultdict(list)
    instrumental = {}
    tags = load_tags(os.path.join(out, "tags.json"))
    for src in files:
        rel = os.path.relpath(src, source).replace(os.sep, "/")
        with open(src, "rb") as f:
            text, enc = decode(f.read())
        encodings[enc] += 1
        text = text.lstrip("\ufeff").replace("\r\n", "\n")

        dst = os.path.join(songs_dir, *rel.split("/"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        # newline="" evita che Windows riconverta LF in CRLF
        with open(dst, "w", encoding="utf-8", newline="") as f:
            f.write(text)

        sid = song_id(rel)
        if sid in ids:
            sys.exit("Id duplicato per %s e %s" % (ids[sid], rel))
        ids[sid] = rel

        folder = rel.rpartition("/")[0]
        stem = os.path.splitext(rel.rpartition("/")[2])[0]
        artist, title = split_name(stem)
        artist = clean_artist(artist) or song_artists.get(fold(stem.strip()), "")
        chords, shapes, doubtful = find_chords(text)
        instrumental[sid] = is_instrumental(text)
        for c in doubtful:
            chord_doubts[c].append(rel)
        artist = aliases.get(artist_key(artist), artist)
        mtime = datetime.datetime.fromtimestamp(os.stat(src).st_mtime, datetime.timezone.utc)
        songs.append({
            "id": sid,
            "artist": artist,
            "title": title,
            "folder": folder,
            "path": rel,
            "mtime": mtime.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "h": hashlib.sha1(text.encode("utf-8")).hexdigest()[:8],
            "text": search_text(text),
            "chords": chords,
            **({"shapes": shapes} if shapes else {}),
        })
        yt = videos.get(fold(stem.strip())) or youtube_id(text)
        if yt:
            songs[-1]["yt"] = yt

    # Stesso artista scritto in modi diversi: si unisce da solo
    spellings = collections.defaultdict(collections.Counter)
    for s in songs:
        if s["artist"]:
            spellings[artist_key(s["artist"])][s["artist"]] += 1
    canonical = {k: pick_spelling(c) for k, c in spellings.items()}
    for s in songs:
        if s["artist"]:
            s["artist"] = canonical[artist_key(s["artist"])]

    # Tag (dopo aver unificato gli artisti)
    for s in songs:
        stem = fold(os.path.splitext(s["path"].rpartition("/")[2])[0].strip())
        mine = []
        for name, rule in tags:
            if stem in rule["escludi"]:
                continue
            if (artist_key(s["artist"]) in rule["artisti"] if s["artist"] else False) \
                    or stem in rule["canzoni"] or s["folder"].casefold() in rule["cartelle"] \
                    or (rule["auto"] == "strumentali" and instrumental[s["id"]]) \
                    or (rule["auto"] == "facili" and is_easy(s["chords"])):
                mine.append(name)
        if mine:
            s["tags"] = mine

    songs.sort(key=lambda s: s["path"].casefold())
    version = hashlib.sha1(
        json.dumps([[s["id"], s["artist"], s["title"], s["h"]] for s in songs]).encode("utf-8")
    ).hexdigest()[:12]
    data = {
        "version": version,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        # sezioni nascoste finché non si sbloccano nell'app
        "hidden": sorted({s["folder"] for s in songs if s["folder"] and s["folder"].casefold()
                          in {h.casefold() for h in config["sezioni_nascoste"]}}),
        "tags": [name for name, _ in tags],
        "songs": songs,
    }
    with open(os.path.join(out, "songs.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    # Riepilogo
    print("Canzoni: %d (in %s)" % (len(songs), songs_dir))
    print("Codifiche: " + ", ".join("%s %d" % kv for kv in encodings.most_common()))
    folders = collections.Counter(s["folder"] or "(principale)" for s in songs)
    print("Cartelle: " + ", ".join("%s %d" % kv for kv in sorted(folders.items())))
    print("Artisti: %d, senza artista: %d" % (
        len({s["artist"] for s in songs if s["artist"]}),
        sum(1 for s in songs if not s["artist"])))
    skipped_dirs = [d for d in skipped_dirs if d.casefold() != config["canzonieri"].casefold()]
    if skipped_dirs:
        print("Sottocartelle escluse (usa --sottocartelle per includerle): " + ", ".join(skipped_dirs))
    print("Canzonieri (PDF): %d, %.1f MB" % (len(books), sum(b["size"] for b in books) / 1048576))
    if books_skipped:
        print("  esclusi (config.json o nome che inizia con _): " + ", ".join(books_skipped))
    if books_big:
        print("  ATTENZIONE, oltre 95 MB, non copiati (GitHub li rifiuta): " + ", ".join(books_big))
    if ignored:
        print("Ignorati: " + ", ".join("%s %d" % kv for kv in ignored.most_common()))

    missing = sorted((s["path"] for s in songs if not s["artist"]), key=str.casefold)
    if missing:
        print("\nSenza artista (aggiungili in song_artists.json o rinomina in 'Artista - Titolo.txt'):")
        for p in missing:
            print("  " + p)

    merged = [(canonical[k], sorted(set(c) - {canonical[k]}))
              for k, c in spellings.items() if len(c) > 1]
    if merged:
        print("\nArtisti unificati automaticamente:")
        for name, others in sorted(merged, key=lambda m: m[0].casefold()):
            print("  %s  <-  %s" % (name, "  |  ".join(others)))

    # Quasi uguali (refusi?): non si uniscono da soli perche' potrebbero
    # essere artisti diversi (es. Blur/Blue). Se lo sono, alias in artists.json.
    keys = sorted(k for k in canonical if len(k) >= 5)
    typos = []
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            if abs(len(a) - len(b)) <= 2 and difflib.SequenceMatcher(None, a, b).ratio() >= 0.9:
                typos.append((canonical[a], canonical[b]))
    if typos:
        print("\nArtisti quasi uguali, forse refusi (se si', aggiungi un alias in artists.json):")
        for a, b in typos:
            print("  %s  |  %s" % (a, b))
    if tags:
        count = collections.Counter(t for s in songs for t in s.get("tags", []))
        print("\nTag: " + ", ".join("%s %d" % (name, count[name]) for name, _ in tags))
        print("  canzoni senza tag: %d" % sum(1 for s in songs if not s.get("tags")))
        known = {artist_key(s["artist"]) for s in songs if s["artist"]}
        stems = {fold(os.path.splitext(s["path"].rpartition("/")[2])[0].strip()) for s in songs}
        for name, rule in tags:
            lost = [a for k, a in rule["artisti"].items() if k not in known]
            lost += [c for c in rule["canzoni"] | rule["escludi"] if c not in stems]
            if lost:
                print("  ATTENZIONE, in tags.json '%s' cita nomi che non trovo: %s" % (name, ", ".join(sorted(lost))))

    # Accordi: riepilogo e rapporto completo in tools/accordi.txt (non pubblicato)
    usage = collections.Counter(c for s in songs for c in s["chords"])
    print("\nAccordi: trovati in %d canzoni su %d, %d accordi diversi" % (
        sum(1 for s in songs if s["chords"]), len(songs), len(usage)))
    report = os.path.join(os.path.dirname(os.path.abspath(__file__)), "accordi.txt")
    with open(report, "w", encoding="utf-8", newline="\n") as f:
        f.write("Accordi per numero di canzoni\n\n")
        for c, n in sorted(usage.items(), key=lambda kv: (-kv[1], kv[0])):
            f.write("%5d  %s\n" % (n, c))
        f.write("\nAccordi trovati come parola isolata dentro righe di testo (da controllare)\n\n")
        for c in sorted(chord_doubts):
            f.write("  %s: %s\n" % (c, ", ".join(sorted(chord_doubts[c]))))
        f.write("\nCanzoni senza accordi riconosciuti\n\n")
        for s in songs:
            if not s["chords"]:
                f.write("  %s\n" % s["path"])
    print("  rapporto completo: %s" % report)
    print("\nVersione: %s" % version)


if __name__ == "__main__":
    main()
