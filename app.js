/* Skepticowl's song vault — elenco + visualizzatore, JS vanilla senza dipendenze. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'skepticowl-vault.v1';
  var TAB = 8;
  var MIN_PT = 5, MAX_PT = 28, DEFAULT_PT = 11;
  var MIN_FIT_PX = 4; // sotto questa dimensione "Adatta" si arrende e lascia scorrere

  // ---------- Stato per dispositivo (localStorage) ----------
  function emptyState() {
    return { favs: {}, plays: {}, last: {}, settings: {}, playlists: [] };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (e) { /* storage non disponibile o corrotto */ }
    return emptyState();
  }
  function normalizeState(s) {
    var out = emptyState();
    if (!s || typeof s !== 'object') return out;
    ['favs', 'plays', 'last', 'settings'].forEach(function (k) {
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) out[k] = s[k];
    });
    if (Array.isArray(s.playlists)) {
      out.playlists = s.playlists.filter(function (p) {
        return p && typeof p.id === 'string' && Array.isArray(p.songs);
      }).map(function (p) {
        return { id: p.id, name: String(p.name || 'Playlist'), songs: p.songs.filter(function (x) { return typeof x === 'string'; }),
          updated: Number(p.updated) || 0 };
      });
    }
    return out;
  }
  var state = loadState();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
  }
  function setting(k, def) {
    return Object.prototype.hasOwnProperty.call(state.settings, k) ? state.settings[k] : def;
  }
  function setSetting(k, v) { state.settings[k] = v; save(); }

  // ---------- Dati ----------
  var songs = [];
  var byId = {};
  var meta = {};

  function fold(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function foldSearch(s) {
    return fold(s).replace(/[^\p{L}\p{N}_']+/gu, ' ').trim();
  }
  var collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function songUrl(s) {
    return 'songs/' + s.path.split('/').map(encodeURIComponent).join('/') + '?v=' + s.h;
  }
  function folderLabel(f) { return f || 'principale'; }

  // ---------- Elenco ----------
  var els = {
    listView: $('listView'), list: $('list'), q: $('q'), inText: $('inText'),
    favOnly: $('favOnly'), sort: $('sort'), folder: $('folder'), count: $('count'),
    viewer: $('viewer'), text: $('text'), scroller: $('scroller'),
    vTitle: $('vTitle'), vArtist: $('vArtist'), vStar: $('vStar'),
    modeFit: $('modeFit'), modeOrig: $('modeOrig'), fontSize: $('fontSize'),
    scrollBtn: $('scrollBtn'), speed: $('speed'), menu: $('menu')
  };

  function relTime(ts) {
    var d = (Date.now() - ts) / 1000;
    if (d < 60) return 'adesso';
    if (d < 3600) return Math.floor(d / 60) + ' min fa';
    if (d < 86400) return Math.floor(d / 3600) + ' h fa';
    if (d < 86400 * 30) return Math.floor(d / 86400) + ' g fa';
    return new Date(ts).toLocaleDateString('it-IT');
  }

  function filtered() {
    var words = foldSearch(els.q.value).split(' ').filter(Boolean);
    var inText = els.inText.checked;
    var favOnly = els.favOnly.getAttribute('aria-pressed') === 'true';
    var folder = els.folder.value;
    var sel = selectedTags();
    var out = [];
    var list = visibleSongs();
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (favOnly && !state.favs[s.id]) continue;
      if (folder !== '*' && s.folder !== folder) continue;
      if (sel.length && !hasTags(s, sel)) continue;
      var hitText = false, ok = true;
      for (var w = 0; w < words.length; w++) {
        if (s._key.indexOf(words[w]) !== -1) continue;
        if (inText && s._text.indexOf(words[w]) !== -1) { hitText = true; continue; }
        ok = false; break;
      }
      if (ok) out.push({ s: s, hitText: hitText });
    }
    return out;
  }

  function byTitle(a, b) {
    return collator.compare(a.s.title, b.s.title) || collator.compare(a.s.artist, b.s.artist);
  }

  function sectionLabel(f) { return f.charAt(0).toUpperCase() + f.slice(1); }

  function render() {
    if (page === 'books') { renderBooks(); return; }
    if (page === 'playlists') { renderPlaylists(); return; }
    if (page === 'playlist') { renderPlaylist(); return; }
    var items = filtered();
    var sort = els.sort.value;
    var html = [];

    // Cartella principale prima, poi ogni sezione (es. cazzate) a parte
    var bySection = {};
    items.forEach(function (it) { (bySection[it.s.folder] = bySection[it.s.folder] || []).push(it); });
    Object.keys(bySection).sort(function (a, b) {
      if (!a) return -1; if (!b) return 1;
      return collator.compare(a, b);
    }).forEach(function (f) {
      if (f) {
        html.push('<h2 class="section">' + escapeHtml(sectionLabel(f)) +
          '<span class="n">' + bySection[f].length + '</span></h2>');
      }
      renderItems(bySection[f], sort, html);
    });

    els.list.innerHTML = items.length ? html.join('') :
      '<p class="empty">' + (songs.length ? 'Nessuna canzone trovata.' : 'Nessuna canzone: lancia tools/build.py.') + '</p>';
    var total = visibleSongs().length;
    els.count.textContent = items.length === total ?
      total + ' canzoni' : items.length + ' di ' + total + ' canzoni';
    renderTagChips();
  }

  // ---------- Tag (da tags.json, applicati da build.py) ----------
  // Più tag insieme si combinano in AND: es. Demenziale + Italiani.
  var tagNames = [];
  function selectedTags() {
    var v = setting('tags', null);
    if (!Array.isArray(v)) v = setting('tag', '') ? [setting('tag', '')] : []; // vecchia impostazione a tag singolo
    return v;
  }
  function hasTags(s, list) {
    if (!s.tags) return false;
    for (var i = 0; i < list.length; i++) if (s.tags.indexOf(list[i]) === -1) return false;
    return true;
  }
  function renderTagChips() {
    var box = $('tagChips'), visible = visibleSongs(), all = {}, count = {};
    visible.forEach(function (s) { (s.tags || []).forEach(function (t) { all[t] = 1; }); });
    // tag non più disponibili (es. solo nella sezione nascosta): via dalla selezione
    var sel = selectedTags().filter(function (t) { return all[t]; });
    if (sel.length !== selectedTags().length) setSetting('tags', sel);
    // per ogni tag: quante canzoni resterebbero aggiungendolo alla selezione
    visible.forEach(function (s) {
      if (!hasTags(s, sel)) return;
      (s.tags || []).forEach(function (t) { count[t] = (count[t] || 0) + 1; });
    });
    var names = tagNames.filter(function (t) { return sel.indexOf(t) !== -1 || count[t]; });
    box.hidden = !tagNames.some(function (t) { return all[t]; });
    box.innerHTML = (sel.length ? '<button type="button" class="chip clear" data-tag-clear aria-label="Togli tutti i tag">&#10005;</button>' : '') +
      names.map(function (t) {
        var on = sel.indexOf(t) !== -1;
        return '<button type="button" class="chip" data-tag="' + escapeHtml(t) + '" aria-pressed="' + on + '">' +
          escapeHtml(t) + (on ? '' : ' <span class="n">' + count[t] + '</span>') + '</button>';
      }).join('');
  }
  $('tagChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tag],[data-tag-clear]');
    if (!b) return;
    var sel = selectedTags().slice();
    if (b.hasAttribute('data-tag-clear')) sel = [];
    else {
      var t = b.getAttribute('data-tag'), i = sel.indexOf(t);
      if (i === -1) sel.push(t); else sel.splice(i, 1);
    }
    setSetting('tags', sel);
    render();
    window.scrollTo(0, 0);
  });

  function renderItems(items, sort, html) {
    if (sort === 'artist') {
      items.sort(function (a, b) {
        var ea = !a.s.artist, eb = !b.s.artist;
        if (ea !== eb) return ea ? 1 : -1; // senza artista in fondo
        return collator.compare(a.s.artist, b.s.artist) || byTitle(a, b);
      });
      var cur = null, groups = [];
      items.forEach(function (it) {
        var name = it.s.artist || '';
        if (!cur || collator.compare(cur.name, name) !== 0) {
          cur = { name: name, items: [] };
          groups.push(cur);
        }
        cur.items.push(it);
      });
      groups.forEach(function (g) {
        html.push('<h2 class="group">' + escapeHtml(g.name || 'Senza artista') +
          '<span class="n">' + g.items.length + '</span></h2>');
        g.items.forEach(function (it) { html.push(row(it, false)); });
      });
    } else {
      if (sort === 'title') items.sort(byTitle);
      if (sort === 'recent') items.sort(function (a, b) {
        return (state.last[b.s.id] || 0) - (state.last[a.s.id] || 0) || byTitle(a, b);
      });
      if (sort === 'plays') items.sort(function (a, b) {
        return (state.plays[b.s.id] || 0) - (state.plays[a.s.id] || 0) || byTitle(a, b);
      });
      items.forEach(function (it) { html.push(row(it, true, sort)); });
    }
  }

  // ---------- Canzonieri (PDF) ----------
  var books = [];
  var page = 'songs';

  function bookUrl(b) { return 'canzonieri/' + encodeURIComponent(b.path) + '?v=' + b.h; }
  function formatSize(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  function renderBooks() {
    var words = foldSearch(els.q.value).split(' ').filter(Boolean);
    var items = books.filter(function (b) {
      return words.every(function (w) { return b._key.indexOf(w) !== -1; });
    });
    els.list.innerHTML = items.length ? items.map(function (b) {
      return '<div class="song book"><span class="pdf" aria-hidden="true">PDF</span>' +
        '<a href="' + bookUrl(b) + '" target="_blank" rel="noopener"><span class="t">' + escapeHtml(b.title) + '</span>' +
        '<span class="m">' + formatSize(b.size) + ' · ' + new Date(b.mtime).toLocaleDateString('it-IT') + '</span></a></div>';
    }).join('') : '<p class="empty">' + (books.length ? 'Nessun canzoniere trovato.' : 'Nessun canzoniere.') + '</p>';
    els.count.textContent = items.length === books.length ?
      books.length + ' canzonieri' : items.length + ' di ' + books.length + ' canzonieri';
  }

  function setPage(p, plId) {
    plId = plId || null; // undefined e null sono la stessa cosa: niente salto in cima
    var changed = p !== page || plId !== openPl;
    if (changed && (p === 'playlist' || page === 'playlist')) els.q.value = '';
    page = p;
    openPl = plId || null;
    var tab = p === 'playlist' ? 'playlists' : p;
    document.querySelectorAll('.tabs a').forEach(function (a) {
      if (a.getAttribute('data-page') === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    $('songFilters').hidden = p !== 'songs';
    els.q.placeholder = {
      books: 'Cerca canzoniere…',
      playlists: 'Cerca playlist…',
      playlist: 'Cerca canzoni da aggiungere…'
    }[p] || 'Cerca artista o titolo…';
    if (changed) { render(); window.scrollTo(0, 0); updateHeadHeight(); }
  }

  // ---------- Playlist ----------
  // Salvate per dispositivo in state.playlists: [{id, name, songs: [id...], updated}]
  var openPl = null;   // playlist aperta nella pagina di dettaglio
  var viewerPl = null; // playlist che si sta "suonando" nel visualizzatore

  function findPl(id) {
    for (var i = 0; i < state.playlists.length; i++) if (state.playlists[i].id === id) return state.playlists[i];
    return null;
  }
  function touchPl(p) { p.updated = Date.now(); save(); }
  function newPl(name) {
    var p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, songs: [], updated: 0 };
    state.playlists.push(p);
    touchPl(p);
    return p;
  }
  function askName(def) {
    var n = window.prompt('Nome della playlist', def || '');
    return n && n.trim() ? n.trim().slice(0, 80) : null;
  }
  function plCount(n) { return n + (n === 1 ? ' canzone' : ' canzoni'); }

  function renderPlaylists() {
    var words = foldSearch(els.q.value).split(' ').filter(Boolean);
    var items = state.playlists.filter(function (p) {
      var k = foldSearch(p.name);
      return words.every(function (w) { return k.indexOf(w) !== -1; });
    }).sort(function (a, b) { return collator.compare(a.name, b.name); });
    els.list.innerHTML = '<div class="pltools"><button type="button" class="primary" data-pl-new>+ Nuova playlist</button></div>' +
      (items.length ? items.map(function (p) {
        return '<div class="song"><span class="plicon" aria-hidden="true">&#9776;</span>' +
          '<a href="#/playlist/' + p.id + '"><span class="t">' + escapeHtml(p.name) + '</span>' +
          '<span class="m">' + plCount(p.songs.length) + '</span></a></div>';
      }).join('') : '<p class="empty">' + (state.playlists.length ? 'Nessuna playlist trovata.' :
        'Nessuna playlist. Creane una, poi aggiungi canzoni da qui o dal visualizzatore (pulsante &#9776;+).') + '</p>');
    els.count.textContent = state.playlists.length + (state.playlists.length === 1 ? ' playlist' : ' playlist');
  }

  function renderPlaylist() {
    var p = findPl(openPl);
    if (!p) { location.hash = '#/playlist'; return; }
    var html = ['<div class="plhead"><a class="icon" href="#/playlist" aria-label="Tutte le playlist">&#8592;</a>' +
      '<h2>' + escapeHtml(p.name) + '</h2>' +
      '<button type="button" class="icon" data-pl-rename title="Rinomina" aria-label="Rinomina">&#9998;</button>' +
      '<button type="button" class="icon" data-pl-delete title="Elimina playlist" aria-label="Elimina playlist">&#128465;</button></div>'];
    if (p.songs.length) {
      html.push('<div class="plsongs" id="plSongs">');
      p.songs.forEach(function (sid, i) {
        var s = byId[sid];
        html.push('<div class="song plrow" data-idx="' + i + '">' +
          '<span class="handle" title="Trascina per spostare" aria-hidden="true">&#8942;&#8942;</span>' +
          '<span class="num">' + (i + 1) + '</span>' +
          (s ? '<a href="#/song/' + sid + '?pl=' + p.id + '" data-open="' + sid + '"><span class="t">' + escapeHtml(s.title) +
            '</span>' + (s.artist ? '<span class="m">' + escapeHtml(s.artist) + '</span>' : '') + '</a>'
            : '<a class="missing"><span class="t">Canzone non trovata</span><span class="m">forse è stata rinominata</span></a>') +
          '<button type="button" class="mini" data-pl-up="' + i + '" aria-label="Su"' + (i ? '' : ' disabled') + '>&#9650;</button>' +
          '<button type="button" class="mini" data-pl-down="' + i + '" aria-label="Giù"' + (i < p.songs.length - 1 ? '' : ' disabled') + '>&#9660;</button>' +
          '<button type="button" class="mini" data-pl-remove="' + i + '" aria-label="Togli">&#10005;</button></div>');
      });
      html.push('</div>');
    } else {
      html.push('<p class="empty">Playlist vuota: cerca in alto le canzoni da aggiungere.</p>');
    }

    // Risultati della ricerca per aggiungere canzoni
    var words = foldSearch(els.q.value).split(' ').filter(Boolean);
    if (words.length) {
      var found = visibleSongs().filter(function (s) {
        return words.every(function (w) { return s._key.indexOf(w) !== -1; });
      }).sort(function (a, b) { return collator.compare(a.artist + a.title, b.artist + b.title); }).slice(0, 50);
      html.push('<h2 class="section">Aggiungi</h2>');
      html.push(found.length ? found.map(function (s) {
        var n = p.songs.filter(function (x) { return x === s.id; }).length;
        return '<div class="song"><button type="button" class="star addbtn" data-pl-add="' + s.id + '" aria-label="Aggiungi">+</button>' +
          '<a href="#/song/' + s.id + '"><span class="t">' + escapeHtml(s.title) + '</span><span class="m">' +
          escapeHtml(s.artist || 'Senza artista') + (n ? ' · già in playlist' : '') + '</span></a></div>';
      }).join('') : '<p class="empty">Nessuna canzone trovata.</p>');
    }
    els.list.innerHTML = html.join('');
    els.count.textContent = plCount(p.songs.length);
  }

  function movePl(p, from, to) {
    if (to < 0 || to >= p.songs.length || from === to) return;
    p.songs.splice(to, 0, p.songs.splice(from, 1)[0]);
    touchPl(p);
  }

  els.list.addEventListener('click', function (e) {
    var t = e.target.closest('[data-pl-new],[data-pl-rename],[data-pl-delete],[data-pl-up],[data-pl-down],[data-pl-remove],[data-pl-add]');
    if (!t) return;
    var p = findPl(openPl), name;
    if (t.hasAttribute('data-pl-new')) {
      if ((name = askName())) location.hash = '#/playlist/' + newPl(name).id;
      return;
    }
    if (!p) return;
    if (t.hasAttribute('data-pl-rename')) {
      if ((name = askName(p.name))) { p.name = name; touchPl(p); }
    } else if (t.hasAttribute('data-pl-delete')) {
      if (!window.confirm('Eliminare la playlist "' + p.name + '"?')) return;
      state.playlists.splice(state.playlists.indexOf(p), 1);
      save();
      location.hash = '#/playlist';
      return;
    } else if (t.hasAttribute('data-pl-up')) {
      var i = Number(t.getAttribute('data-pl-up'));
      movePl(p, i, i - 1);
    } else if (t.hasAttribute('data-pl-down')) {
      var j = Number(t.getAttribute('data-pl-down'));
      movePl(p, j, j + 1);
    } else if (t.hasAttribute('data-pl-remove')) {
      p.songs.splice(Number(t.getAttribute('data-pl-remove')), 1);
      touchPl(p);
    } else if (t.hasAttribute('data-pl-add')) {
      p.songs.push(t.getAttribute('data-pl-add'));
      touchPl(p);
      toast('Aggiunta a "' + p.name + '"');
    }
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });

  // Trascinamento dalla maniglia (mouse e dita)
  (function () {
    var drag = null;
    els.list.addEventListener('pointerdown', function (e) {
      var h = e.target.closest('.handle');
      if (!h || page !== 'playlist') return;
      var row = h.closest('.plrow');
      drag = { row: row, from: Number(row.getAttribute('data-idx')), id: e.pointerId };
      h.setPointerCapture(e.pointerId);
      row.classList.add('dragging');
      e.preventDefault();
    });
    els.list.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var box = drag.row.parentNode;
      var rows = Array.prototype.filter.call(box.children, function (r) { return r !== drag.row; });
      var before = null;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { before = rows[i]; break; }
      }
      if (before !== drag.row.nextSibling) box.insertBefore(drag.row, before);
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var to = Array.prototype.indexOf.call(drag.row.parentNode.children, drag.row);
      var p = findPl(openPl);
      drag.row.classList.remove('dragging');
      if (p) movePl(p, drag.from, to);
      drag = null;
      var y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    els.list.addEventListener('pointerup', end);
    els.list.addEventListener('pointercancel', end);
  })();

  // Visualizzatore dentro una playlist: barra ◀ n/N ▶
  function plIndex(p, id) {
    var at = Number(setting('plPos_' + p.id, -1));
    if (p.songs[at] === id) return at; // stessa canzone ripetuta: ricorda la posizione
    return p.songs.indexOf(id);
  }
  function updatePlBar(id) {
    var p = viewerPl && findPl(viewerPl), bar = $('plBar');
    if (!p) { bar.hidden = true; return; }
    var i = plIndex(p, id);
    $('plName').textContent = p.name;
    $('plPos').textContent = (i + 1) + '/' + p.songs.length;
    $('plPrev').disabled = i <= 0;
    $('plNext').disabled = i < 0 || i >= p.songs.length - 1;
    bar.hidden = false;
  }
  function stepPl(d) {
    var p = viewerPl && findPl(viewerPl);
    if (!p || !current) return;
    var i = plIndex(p, current.id) + d;
    if (i < 0 || i >= p.songs.length) return;
    setSetting('plPos_' + p.id, i);
    location.replace('#/song/' + p.songs[i] + '?pl=' + p.id);
  }
  $('plPrev').addEventListener('click', function () { stepPl(-1); });
  $('plNext').addEventListener('click', function () { stepPl(1); });
  els.list.addEventListener('click', function (e) {
    // posizione esatta della canzone aperta dalla playlist
    var a = e.target.closest('.plrow a[data-open]');
    if (a && openPl) setSetting('plPos_' + openPl, Number(a.closest('.plrow').getAttribute('data-idx')));
  });

  // Dialogo "aggiungi a playlist" dal visualizzatore
  var plDialog = $('plDialog');
  function renderPlDialog() {
    var sid = current && current.id;
    $('plDialogList').innerHTML = state.playlists.length ? state.playlists.slice().sort(function (a, b) {
      return collator.compare(a.name, b.name);
    }).map(function (p) {
      var has = p.songs.indexOf(sid) !== -1;
      return '<button type="button" class="plpick' + (has ? ' on' : '') + '" data-pick="' + p.id + '" aria-pressed="' + has + '">' +
        '<span>' + (has ? '&#10003;' : '+') + '</span>' + escapeHtml(p.name) +
        '<small>' + plCount(p.songs.length) + '</small></button>';
    }).join('') : '<p class="muted">Ancora nessuna playlist.</p>';
  }
  $('plAddBtn').addEventListener('click', function () {
    if (!current) return;
    renderPlDialog();
    if (plDialog.showModal) plDialog.showModal(); else plDialog.setAttribute('open', '');
  });
  $('plDialogList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]');
    if (!b || !current) return;
    var p = findPl(b.getAttribute('data-pick'));
    var i = p.songs.indexOf(current.id);
    if (i === -1) p.songs.push(current.id); else p.songs.splice(i, 1);
    touchPl(p);
    renderPlDialog();
    updatePlBar(current.id);
  });
  $('plDialogNew').addEventListener('click', function () {
    var name = askName();
    if (!name || !current) return;
    newPl(name).songs.push(current.id);
    save();
    renderPlDialog();
  });

  function row(it, showArtist, sort) {
    var s = it.s, fav = !!state.favs[s.id], m = [];
    if (showArtist && s.artist) m.push(escapeHtml(s.artist));
    if (sort === 'recent' && state.last[s.id]) m.push(relTime(state.last[s.id]));
    if (sort === 'plays' && state.plays[s.id]) m.push(state.plays[s.id] + (state.plays[s.id] === 1 ? ' apertura' : ' aperture'));
    if (it.hitText) m.push('<span class="hit">nel testo</span>');
    if (s.tags) m.push('<span class="tg">' + s.tags.map(escapeHtml).join(' · ') + '</span>');
    return '<div class="song">' +
      '<button class="star' + (fav ? ' on' : '') + '" type="button" data-fav="' + s.id + '" aria-pressed="' + fav +
      '" aria-label="Preferito">' + (fav ? '★' : '☆') + '</button>' +
      '<a href="#/song/' + s.id + '" data-open="' + s.id + '"><span class="t">' + escapeHtml(s.title) + '</span>' +
      (m.length ? '<span class="m">' + m.join(' · ') + '</span>' : '') + '</a></div>';
  }

  var renderTimer = 0;
  function renderSoon() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 60); }

  function toggleFav(id) {
    if (state.favs[id]) delete state.favs[id]; else state.favs[id] = 1;
    save();
  }

  els.list.addEventListener('click', function (e) {
    var star = e.target.closest('[data-fav]');
    if (star) {
      var id = star.getAttribute('data-fav');
      toggleFav(id);
      var on = !!state.favs[id];
      star.classList.toggle('on', on);
      star.textContent = on ? '★' : '☆';
      star.setAttribute('aria-pressed', String(on));
      if (els.favOnly.getAttribute('aria-pressed') === 'true') renderSoon();
      return;
    }
    var link = e.target.closest('[data-open]');
    if (link) {
      var sid = link.getAttribute('data-open');
      state.plays[sid] = (state.plays[sid] || 0) + 1;
      save();
      cameFromList = true;
    }
  });

  els.q.addEventListener('input', renderSoon);
  els.inText.addEventListener('change', function () { setSetting('inText', els.inText.checked); render(); });
  els.sort.addEventListener('change', function () { setSetting('sort', els.sort.value); render(); window.scrollTo(0, 0); });
  els.folder.addEventListener('change', function () { setSetting('folder', els.folder.value); render(); window.scrollTo(0, 0); });
  els.favOnly.addEventListener('click', function () {
    var on = els.favOnly.getAttribute('aria-pressed') !== 'true';
    els.favOnly.setAttribute('aria-pressed', String(on));
    setSetting('favOnly', on);
    render();
  });

  // Le intestazioni degli artisti si fermano sotto la barra di ricerca
  function updateHeadHeight() {
    var h = document.querySelector('#listView .sticky').offsetHeight;
    document.documentElement.style.setProperty('--head-h', h + 'px');
  }
  window.addEventListener('resize', updateHeadHeight);

  // ---------- Visualizzatore ----------
  var current = null;      // canzone aperta
  var maxCols = 0;         // colonne della riga più lunga (tab espanse a 8)
  var listScroll = 0;
  var cameFromList = false;
  var loadToken = 0;

  function isMobile() {
    return window.matchMedia('(max-width: 759px), (pointer: coarse)').matches;
  }
  function mode() { return setting('mode', isMobile() ? 'fit' : 'orig'); }
  function basePt() { return setting('fontPt', DEFAULT_PT); }

  function columns(text) {
    var max = 0, col = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c === 10) { if (col > max) max = col; col = 0; }
      else if (c === 9) col += TAB - (col % TAB);
      else if (c >= 0xdc00 && c <= 0xdfff) { /* seconda metà di una coppia surrogata */ }
      else if (c >= 0x300 && c <= 0x36f) { /* accento combinante */ }
      else col++;
    }
    return Math.max(max, col);
  }

  var charRatio = 0; // larghezza di un carattere / dimensione del font
  function measureRatio() {
    if (charRatio) return charRatio;
    var probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px;font-family:' +
      getComputedStyle(els.text).fontFamily;
    probe.textContent = '0123456789'.repeat(10);
    document.body.appendChild(probe);
    charRatio = probe.getBoundingClientRect().width / 100 / 100 || 0.55;
    document.body.removeChild(probe);
    return charRatio;
  }

  function applyLayout() {
    if (!current) return;
    var pt = basePt();
    var px = pt * 4 / 3;
    var m = mode();
    if (m === 'fit' && maxCols > 0) {
      var cs = getComputedStyle(els.text);
      var avail = els.scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
      var fit = avail / (maxCols * measureRatio()) * 0.985;
      px = Math.max(MIN_FIT_PX, Math.min(px, Math.floor(fit * 10) / 10));
    }
    els.text.style.fontSize = px + 'px';
    els.modeFit.setAttribute('aria-pressed', String(m === 'fit'));
    els.modeOrig.setAttribute('aria-pressed', String(m === 'orig'));
    els.fontSize.textContent = m === 'fit' && px < pt * 4 / 3 - 0.05 ?
      (px * 0.75).toFixed(1) + '/' + pt : pt + 'pt';
    els.fontSize.title = m === 'fit' ? 'Dimensione attuale / massima' : 'Dimensione del carattere';
  }

  function setMode(m) { setSetting('mode', m); applyLayout(); }
  function bumpFont(d) {
    setSetting('fontPt', Math.max(MIN_PT, Math.min(MAX_PT, basePt() + d)));
    applyLayout();
  }
  els.modeFit.addEventListener('click', function () { setMode('fit'); });
  els.modeOrig.addEventListener('click', function () { setMode('orig'); els.scroller.scrollLeft = 0; });
  $('fontDown').addEventListener('click', function () { bumpFont(-1); });
  $('fontUp').addEventListener('click', function () { bumpFont(1); });
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyLayout, 80);
  });

  function updateViewerStar() {
    if (!current) return;
    var on = !!state.favs[current.id];
    els.vStar.classList.toggle('on', on);
    els.vStar.textContent = on ? '★' : '☆';
    els.vStar.setAttribute('aria-pressed', String(on));
  }
  els.vStar.addEventListener('click', function () {
    if (!current) return;
    toggleFav(current.id);
    updateViewerStar();
  });

  function showMessage(msg) {
    els.text.className = 'msg';
    els.text.textContent = msg;
  }

  function openSong(id, plId) {
    var s = byId[id];
    viewerPl = plId && findPl(plId) ? plId : null;
    updatePlBar(id);
    if (!els.viewer.hidden && current && current.id === id) return;
    if (els.viewer.hidden) listScroll = window.scrollY;
    els.listView.hidden = true;
    els.viewer.hidden = false;
    document.body.classList.add('reading');
    window.scrollTo(0, 0);
    stopScroll();

    if (!s) {
      current = null;
      els.vTitle.textContent = 'Canzone non trovata';
      els.vArtist.textContent = '';
      showMessage('Questa canzone non esiste più (forse è stata rinominata).');
      return;
    }
    current = s;
    state.last[id] = Date.now();
    save();
    document.title = s.title + (s.artist ? ' – ' + s.artist : '') + " · Skepticowl's song vault";
    els.vTitle.textContent = s.title;
    els.vArtist.textContent = [s.artist, s.folder].filter(Boolean).join(' · ');
    updateViewerStar();
    showMessage('Caricamento…');
    $('chordStrip').hidden = true;
    requestWakeLock();

    var token = ++loadToken;
    fetch(songUrl(s)).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (t) {
      if (token !== loadToken) return;
      maxCols = columns(t);
      els.text.className = '';
      els.text.innerHTML = markChords(t, s.chords || []);
      renderChords();
      applyLayout();
    }).catch(function () {
      if (token !== loadToken) return;
      showMessage(navigator.onLine ? 'Impossibile caricare la canzone.' :
        'Sei offline e questa canzone non è ancora salvata sul dispositivo.');
    });
  }

  function showList() {
    stopScroll();
    releaseWakeLock();
    current = null;
    loadToken++;
    document.title = "Skepticowl's song vault";
    var wasViewer = !els.viewer.hidden;
    els.viewer.hidden = true;
    els.listView.hidden = false;
    document.body.classList.remove('reading');
    if (wasViewer) {
      render(); // aggiorna stelle, contatori e "ultimo utilizzo"
      updateHeadHeight();
      window.scrollTo(0, listScroll);
    }
  }

  function goBack() {
    if (cameFromList && history.length > 1) history.back();
    else location.hash = viewerPl ? '#/playlist/' + viewerPl : '#/';
  }
  $('backBtn').addEventListener('click', goBack);

  // ---------- Diagrammi degli accordi ----------
  // Gli accordi di ogni canzone li trova build.py (songs.json: chords, shapes);
  // qui si disegnano. Un tocco su un diagramma mostra la diteggiatura successiva.
  var chordAlt = {};
  function renderChords() {
    var strip = $('chordStrip'), list = (current && current.chords) || [];
    var on = setting('showChords', true);
    $('chordsBtn').setAttribute('aria-pressed', String(on));
    $('chordsBtn').hidden = !list.length || !window.UkeChords;
    if (!list.length || !on || !window.UkeChords) { strip.hidden = true; return; }
    var custom = current.shapes || {};
    strip.innerHTML = list.map(function (name) {
      var all = UkeChords.shapes(name, custom[name]);
      if (!all.length) return '';
      var i = (chordAlt[current.id + '|' + name] || 0) % all.length;
      return '<button type="button" class="chordbtn" data-chord="' + escapeHtml(name) + '" title="' +
        (all.length > 1 ? 'Tocca per un\'altra diteggiatura' : escapeHtml(name)) + '">' +
        UkeChords.svg(name, all[i], all.length > 1 ? (i + 1) + '/' + all.length : '') + '</button>';
    }).join('');
    strip.hidden = false;
  }
  // Accordi nel testo in grassetto. Stesse regole di build.py: [Am] sempre;
  // parole isolate solo se sono tra gli accordi della canzone, e quelle
  // ambigue (A, E, notazione italiana) solo nelle righe fatte di accordi.
  var TAB_RE = /^\s*[A-Ga-g][#b]?\s*[|:]?-*[|:]?[-0-9hpbr\/\\~x|]{4,}/;
  var NOISE_RE = /^(?:x\d+|\d+x|[-|\/.:%*]+|\(?x?\d+\)?|n\.?c\.?|\d{4})$/i;
  var ITA_RE = /^(Do|Re|Mi|Fa|Sol|La|Si)/;
  function markChords(text, chords) {
    if (!chords.length) return escapeHtml(text);
    var set = {};
    chords.forEach(function (c) { set[c] = 1; });
    return text.split('\n').map(function (line) {
      if (TAB_RE.test(line)) return escapeHtml(line);
      var toks = line.replace(/\[[^\]\s]{1,16}\]/g, ' ').split(/[\s|]+/).filter(function (t) {
        return t && !NOISE_RE.test(t);
      });
      var hits = toks.filter(function (t) { return set[t] || set[t.replace(/^[(\[]+|[)\],;!?.]+$/g, '')]; }).length;
      var chordLine = toks.length && hits >= 0.6 * toks.length;
      // pezzi: [Accordo] | spazi | parola
      return line.replace(/\[([^\]\s]{1,16})\]|[^\s|\[]+|[\s|]+|\[/g, function (m, br) {
        if (br !== undefined) return set[br] ? '<b class="ch">' + escapeHtml(m) + '</b>' : escapeHtml(m);
        var core = m.replace(/^[(\[]+|[)\],;!?.]+$/g, '');
        if (!set[m] && !set[core]) return escapeHtml(m);
        var ambiguous = m === 'A' || m === 'E' || ITA_RE.test(core);
        if (!chordLine && (ambiguous || core.length < 2)) return escapeHtml(m);
        if (set[m]) return '<b class="ch">' + escapeHtml(m) + '</b>';
        var i = m.indexOf(core);
        return escapeHtml(m.slice(0, i)) + '<b class="ch">' + escapeHtml(core) + '</b>' + escapeHtml(m.slice(i + core.length));
      });
    }).join('\n');
  }

  function toggleChords() {
    setSetting('showChords', !setting('showChords', true));
    renderChords();
  }
  $('chordsBtn').addEventListener('click', toggleChords);
  $('chordStrip').addEventListener('click', function (e) {
    var b = e.target.closest('[data-chord]');
    if (!b || !current) return;
    var k = current.id + '|' + b.getAttribute('data-chord');
    chordAlt[k] = (chordAlt[k] || 0) + 1;
    var x = $('chordStrip').scrollLeft;
    renderChords();
    $('chordStrip').scrollLeft = x;
  });

  // ---------- Scorrimento automatico ----------
  var scrolling = false, lastT = 0, carry = 0, rafId = 0;
  function speedPx() { return 6 * setting('speed', 5); } // pixel al secondo
  function step(t) {
    if (!scrolling) return;
    if (lastT) {
      carry += speedPx() * (t - lastT) / 1000;
      var whole = Math.floor(carry);
      if (whole >= 1) {
        carry -= whole;
        var before = window.scrollY;
        window.scrollBy(0, whole);
        if (window.scrollY === before && window.innerHeight + before >= document.documentElement.scrollHeight - 2) {
          stopScroll();
          return;
        }
      }
    }
    lastT = t;
    rafId = requestAnimationFrame(step);
  }
  function startScroll() {
    if (scrolling) return;
    scrolling = true; lastT = 0; carry = 0;
    els.scrollBtn.setAttribute('aria-pressed', 'true');
    els.scrollBtn.innerHTML = '&#10074;&#10074;';
    rafId = requestAnimationFrame(step);
  }
  function stopScroll() {
    scrolling = false;
    cancelAnimationFrame(rafId);
    els.scrollBtn.setAttribute('aria-pressed', 'false');
    els.scrollBtn.innerHTML = '&#9654;';
  }
  els.scrollBtn.addEventListener('click', function () { if (scrolling) stopScroll(); else startScroll(); });
  els.speed.value = setting('speed', 5);
  els.speed.addEventListener('input', function () { setSetting('speed', Number(els.speed.value)); });

  // ---------- Wake Lock ----------
  var wakeLock = null;
  function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) {
      if (!current) { l.release(); return; }
      wakeLock = l;
      l.addEventListener('release', function () { if (wakeLock === l) wakeLock = null; });
    }).catch(function () { /* non concesso: pazienza */ });
  }
  function releaseWakeLock() {
    if (wakeLock) { var l = wakeLock; wakeLock = null; l.release().catch(function () {}); }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && current) requestWakeLock();
  });

  // ---------- Routing ----------
  function route() {
    var m = location.hash.match(/^#\/song\/([\w-]+)(?:\?pl=([\w-]+))?/);
    if (m) { openSong(m[1], m[2]); return; }
    showList();
    var pm = location.hash.match(/^#\/playlist(?:\/([\w-]+))?$/);
    if (pm && pm[1] && findPl(pm[1])) setPage('playlist', pm[1]);
    else if (pm) setPage('playlists');
    else setPage(location.hash === '#/canzonieri' && books.length ? 'books' : 'songs');
  }
  window.addEventListener('hashchange', route);
  // La posizione di scorrimento la gestisce l'app (elenco ↔ canzone), non il browser
  try { history.scrollRestoration = 'manual'; } catch (e) { /* vecchi browser */ }

  // ---------- Tastiera (PC) ----------
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (!els.viewer.hidden) {
      if (e.key === 'Escape' && !els.menu.open) goBack();
      else if (typing) return;
      else if (e.key === '+' || e.key === '=') bumpFont(1);
      else if (e.key === '-') bumpFont(-1);
      else if (e.key === 's' || e.key === 'S') { if (scrolling) stopScroll(); else startScroll(); }
      else if (e.key === 'f' || e.key === 'F') setMode(mode() === 'fit' ? 'orig' : 'fit');
      else if (e.key === 'c' || e.key === 'C') toggleChords();
      else if ((e.key === 'n' || e.key === 'N') && viewerPl) stepPl(1);
      else if ((e.key === 'p' || e.key === 'P') && viewerPl) stepPl(-1);
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      els.q.focus();
    }
  });

  // ---------- Menu, export/import ----------
  var menuMsg = $('menuMsg');
  $('menuBtn').addEventListener('click', function () {
    menuMsg.textContent = '';
    $('info').textContent = songs.length + ' canzoni' +
      (meta.generated ? ' · aggiornate il ' + new Date(meta.generated).toLocaleString('it-IT') : '');
    updateOfflineInfo();
    if (els.menu.showModal) els.menu.showModal(); else els.menu.setAttribute('open', '');
  });

  $('exportBtn').addEventListener('click', function () {
    var data = JSON.stringify({ app: 'skepticowl-vault', version: 1, exported: new Date().toISOString(),
      favs: state.favs, plays: state.plays, last: state.last, settings: state.settings,
      playlists: state.playlists }, null, 1);
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'skepticowl-vault-stato-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    menuMsg.textContent = 'Stato esportato.';
  });

  $('importBtn').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function (e) {
    var f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.text().then(function (txt) {
      var inc = normalizeState(JSON.parse(txt));
      var n = Object.keys(inc.favs).length;
      // Unione: preferiti sommati, per contatori e date vince il valore più alto
      Object.keys(inc.favs).forEach(function (k) { if (inc.favs[k]) state.favs[k] = 1; });
      Object.keys(inc.plays).forEach(function (k) {
        var v = Number(inc.plays[k]) || 0;
        if (v > (state.plays[k] || 0)) state.plays[k] = v;
      });
      Object.keys(inc.last).forEach(function (k) {
        var v = Number(inc.last[k]) || 0;
        if (v > (state.last[k] || 0)) state.last[k] = v;
      });
      Object.keys(inc.settings).forEach(function (k) { state.settings[k] = inc.settings[k]; });
      // Playlist: stessa id -> vince la versione modificata per ultima
      inc.playlists.forEach(function (p) {
        var mine = findPl(p.id);
        if (!mine) state.playlists.push(p);
        else if (p.updated > mine.updated) state.playlists[state.playlists.indexOf(mine)] = p;
      });
      save();
      fillFolders();
      applySettings();
      render();
      menuMsg.textContent = 'Importato: ' + n + ' preferiti e ' + inc.playlists.length +
        ' playlist uniti a quelli già presenti.';
    }).catch(function () {
      menuMsg.textContent = 'File non valido.';
    });
  });

  // ---------- Offline (service worker) ----------
  var offlineStatus = '';
  function updateOfflineInfo() {
    $('offline').textContent = 'serviceWorker' in navigator && location.protocol !== 'file:' ?
      (offlineStatus || 'Offline: preparazione…') : 'Offline non disponibile in questo browser.';
  }
  function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'precache-progress') {
        offlineStatus = d.done >= d.total ?
          'Offline: tutte le ' + d.total + ' canzoni sono salvate sul dispositivo.' :
          'Offline: salvataggio ' + d.done + '/' + d.total + ' canzoni…' + (d.failed ? ' (' + d.failed + ' errori)' : '');
        if (els.menu.open) updateOfflineInfo();
      }
    });
    // Quando una nuova versione del service worker prende il controllo,
    // ricarica una volta la pagina così app.js e index.html sono della stessa versione
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloaded && els.viewer.hidden) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js').then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      if (reg.active && songs.length) {
        reg.active.postMessage({
          type: 'precache',
          urls: songs.map(function (s) { return new URL(songUrl(s), location.href).href; })
        });
      }
    }).catch(function () { /* niente offline */ });
  }

  // ---------- Scorrimento rapido (touch) ----------
  // Sul telefono la barra di scorrimento non si può trascinare: compare una
  // maniglia sul bordo destro che, trascinata, scorre tutta la pagina.
  (function () {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    var track = document.createElement('div');
    track.className = 'fastscroll';
    track.innerHTML = '<div class="thumb" aria-hidden="true"></div>';
    document.body.appendChild(track);
    var thumb = track.firstChild, dragging = false, hideTimer = 0, grab = 0;

    function maxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }
    function range() { return track.clientHeight - thumb.offsetHeight; }
    function place() {
      var max = maxScroll();
      thumb.style.transform = 'translateY(' + (max > 0 ? window.scrollY / max * range() : 0) + 'px)';
    }
    function show() {
      if (maxScroll() < window.innerHeight * 2) return; // pagina corta: non serve
      place();
      track.classList.add('on');
      clearTimeout(hideTimer);
      if (!dragging) hideTimer = setTimeout(function () { track.classList.remove('on'); }, 1500);
    }
    window.addEventListener('scroll', function () { if (!dragging) show(); }, { passive: true });
    thumb.addEventListener('pointerdown', function (e) {
      dragging = true;
      grab = e.clientY - thumb.getBoundingClientRect().top;
      thumb.setPointerCapture(e.pointerId);
      track.classList.add('on', 'drag');
      clearTimeout(hideTimer);
      e.preventDefault();
    });
    thumb.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var y = e.clientY - grab - track.getBoundingClientRect().top;
      var ratio = Math.max(0, Math.min(1, y / range()));
      window.scrollTo(0, ratio * maxScroll());
      place();
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('drag');
      show();
    }
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
  })();

  // ---------- Installazione come app (Android/Chrome) ----------
  // Il browser segnala con beforeinstallprompt che il sito è installabile:
  // si mostra un invito; "Non ora" lo rimanda di 14 giorni.
  var installEvent = null;
  var INSTALL_SNOOZE = 14 * 86400000;
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvent = e;
    $('menuInstall').hidden = false;
    if (!isStandalone() && Date.now() - setting('installSnooze', 0) > INSTALL_SNOOZE) {
      setTimeout(function () { if (installEvent) $('installBar').hidden = false; }, 1500);
    }
  });
  function install() {
    if (!installEvent) return;
    var e = installEvent;
    installEvent = null;
    $('installBar').hidden = true;
    $('menuInstall').hidden = true;
    e.prompt();
    e.userChoice.then(function (r) {
      if (r.outcome !== 'accepted') setSetting('installSnooze', Date.now());
    }).catch(function () {});
  }
  $('installYes').addEventListener('click', install);
  $('menuInstall').addEventListener('click', function () { els.menu.close(); install(); });
  $('installNo').addEventListener('click', function () {
    $('installBar').hidden = true;
    setSetting('installSnooze', Date.now());
  });
  window.addEventListener('appinstalled', function () {
    installEvent = null;
    $('installBar').hidden = true;
    $('menuInstall').hidden = true;
    toast('\uD83E\uDD89 App installata');
  });

  // ---------- Avvio ----------
  function applySettings() {
    els.inText.checked = !!setting('inText', false);
    els.sort.value = setting('sort', 'artist');
    if (!els.sort.value) els.sort.value = 'artist';
    var f = setting('folder', '*');
    els.folder.value = f;
    if (els.folder.value !== f) els.folder.value = '*';
    els.favOnly.setAttribute('aria-pressed', String(!!setting('favOnly', false)));
    els.speed.value = setting('speed', 5);
    applyLayout();
  }

  // ---------- Sezioni nascoste (es. cazzate) ----------
  // Si sbloccano/ribloccano con 5 tocchi veloci sul titolo; la scelta resta
  // su questo dispositivo. Non è una protezione: i file restano pubblici.
  var hiddenSections = [];
  function isHidden(s) { return !setting('unlocked', false) && hiddenSections.indexOf(s.folder) !== -1; }
  function visibleSongs() { return songs.filter(function (s) { return !isHidden(s); }); }

  var taps = [];
  document.querySelector('#listView h1').addEventListener('click', function () {
    var now = Date.now();
    taps = taps.filter(function (t) { return now - t < 2500; });
    taps.push(now);
    if (taps.length < 5 || !hiddenSections.length) return;
    taps = [];
    var on = !setting('unlocked', false);
    setSetting('unlocked', on);
    fillFolders();
    render();
    toast(on ? '\uD83E\uDD89 Sezione segreta sbloccata' : '\uD83E\uDD89 Sezione segreta nascosta');
  });

  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  function fillFolders() {
    var cur = els.folder.value;
    while (els.folder.options.length > 1) els.folder.remove(1);
    var seen = {};
    visibleSongs().forEach(function (s) { seen[s.folder] = (seen[s.folder] || 0) + 1; });
    Object.keys(seen).sort(function (a, b) {
      if (!a) return -1; if (!b) return 1;
      return collator.compare(a, b);
    }).forEach(function (f) {
      var o = document.createElement('option');
      o.value = f;
      o.textContent = folderLabel(f) + ' (' + seen[f] + ')';
      els.folder.appendChild(o);
    });
    // Con una sola cartella il filtro non serve
    els.folder.closest('label').hidden = Object.keys(seen).length < 2;
    els.folder.value = cur;
    if (els.folder.value !== cur) els.folder.value = '*';
  }

  fetch('songs.json', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (data) {
    meta = data;
    songs = data.songs || [];
    hiddenSections = data.hidden || [];
    tagNames = data.tags || [];
    songs.forEach(function (s) {
      s._key = foldSearch(s.artist + ' ' + s.title + ' ' + s.folder + ' ' + (s.tags || []).join(' '));
      s._text = ' ' + (s.text || '') + ' ';
      byId[s.id] = s;
    });
    fillFolders();
    applySettings();
    return fetch('canzonieri.json', { cache: 'no-cache' }).then(function (r) {
      return r.ok ? r.json() : { items: [] };
    }).catch(function () { return { items: [] }; });
  }).then(function (data) {
    books = (data && data.items) || [];
    books.forEach(function (b) { b._key = foldSearch(b.title); });
    document.querySelector('.tabs a[data-page="books"]').hidden = !books.length;
    render();
    updateHeadHeight();
    route();
    setupServiceWorker();
  }).catch(function () {
    els.list.innerHTML = '<p class="empty">Impossibile caricare songs.json.</p>';
    updateHeadHeight();
  });
})();
