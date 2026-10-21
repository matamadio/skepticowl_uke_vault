#!/usr/bin/env python3
"""Genera il sito di Skepticowl's song vault a partire da una cartella di .txt.

Uso:
    python tools/build.py "X:\\Dropbox\\Public\\Uke"
    python tools/build.py SORGENTE --sottocartelle
    python tools/build.py SORGENTE --out CARTELLA_DEL_REPO

Cosa fa:
  * prende i file .txt della cartella sorgente; le sottocartelle sono escluse,
    a meno di usare --sottocartelle (tutto il resto, pdf/docx/gp5/midi/
    immagini/.lnk..., viene ignorato, come le cartelle che iniziano con un
    punto);
  * riconosce la codifica (UTF-16 con BOM, UTF-8 con o senza BOM, altrimenti
    cp1252) e riscrive tutto in UTF-8 senza BOM, lasciando intatti spazi e
    tab: l'unica modifica e' CRLF -> LF;
  * ricrea da zero la cartella songs/ del repository e scrive songs.json.

Solo libreria standard, Python 3.9+.
"""

import argparse
import codecs
import collections
import datetime
import difflib
import hashlib
import json
import os
import re
import shutil
import sys
import unicodedata

SEPARATORS = (" - ", " \u2013 ")  # trattino e trattino medio (en dash)


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
    best = None
    for sep in SEPARATORS:
        i = stem.find(sep)
        if i > 0 and (best is None or i < best[0]):
            best = (i, sep)
    if best is None:
        return "", stem.strip()
    i, sep = best
    artist, title = stem[:i].strip(), stem[i + len(sep):].strip()
    if not title:
        return "", stem.strip()
    return artist, title


def fold(s):
    """Minuscolo e senza accenti (come la ricerca dell'app)."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower()


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


def song_id(rel_path):
    """Id stabile: dipende solo dal percorso relativo (senza maiuscole)."""
    return hashlib.sha1(rel_path.casefold().encode("utf-8")).hexdigest()[:10]


def is_inside(path, folder):
    """True se path e' folder o sta dentro folder (dischi diversi su Windows: no)."""
    try:
        return os.path.commonpath([os.path.normcase(path), os.path.normcase(folder)]) == os.path.normcase(folder)
    except ValueError:  # es. X:\ e C:\ su Windows
        return False


def collect(source, recursive):
    found, ignored, skipped_dirs = [], collections.Counter(), []
    for root, dirs, files in os.walk(source):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        if not recursive:
            skipped_dirs, dirs[:] = dirs[:], []
        for name in sorted(files):
            ext = os.path.splitext(name)[1].lower()
            if ext == ".txt" and not name.startswith("."):
                found.append(os.path.join(root, name))
            else:
                ignored[ext or "(senza estensione)"] += 1
    return found, ignored, skipped_dirs


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
    if is_inside(source, songs_dir):
        sys.exit("La sorgente non puo' stare dentro %s" % songs_dir)

    aliases = load_aliases(os.path.join(out, "artists.json"))
    files, ignored, skipped_dirs = collect(source, args.sottocartelle)

    if os.path.isdir(songs_dir):
        shutil.rmtree(songs_dir)

    songs, encodings, ids = [], collections.Counter(), {}
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
        artist, title = split_name(os.path.splitext(rel.rpartition("/")[2])[0])
        artist = clean_artist(artist)
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
        })

    # Stesso artista scritto in modi diversi: si unisce da solo
    spellings = collections.defaultdict(collections.Counter)
    for s in songs:
        if s["artist"]:
            spellings[artist_key(s["artist"])][s["artist"]] += 1
    canonical = {k: pick_spelling(c) for k, c in spellings.items()}
    for s in songs:
        if s["artist"]:
            s["artist"] = canonical[artist_key(s["artist"])]

    songs.sort(key=lambda s: s["path"].casefold())
    version = hashlib.sha1(
        json.dumps([[s["id"], s["artist"], s["title"], s["h"]] for s in songs]).encode("utf-8")
    ).hexdigest()[:12]
    data = {
        "version": version,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
    if skipped_dirs:
        print("Sottocartelle escluse (usa --sottocartelle per includerle): " + ", ".join(skipped_dirs))
    if ignored:
        print("Ignorati: " + ", ".join("%s %d" % kv for kv in ignored.most_common()))

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
    print("\nVersione: %s" % version)


if __name__ == "__main__":
    main()
