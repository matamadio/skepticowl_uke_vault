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
    return { favs: {}, plays: {}, last: {}, settings: {} };
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
    var out = [];
    for (var i = 0; i < songs.length; i++) {
      var s = songs[i];
      if (favOnly && !state.favs[s.id]) continue;
      if (folder !== '*' && s.folder !== folder) continue;
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

  function render() {
    var items = filtered();
    var sort = els.sort.value;
    var html = [];

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

    els.list.innerHTML = items.length ? html.join('') :
      '<p class="empty">' + (songs.length ? 'Nessuna canzone trovata.' : 'Nessuna canzone: lancia tools/build.py.') + '</p>';
    els.count.textContent = items.length === songs.length ?
      songs.length + ' canzoni' : items.length + ' di ' + songs.length + ' canzoni';
  }

  function row(it, showArtist, sort) {
    var s = it.s, fav = !!state.favs[s.id], m = [];
    if (showArtist && s.artist) m.push(escapeHtml(s.artist));
    if (s.folder) m.push(escapeHtml(s.folder));
    if (sort === 'recent' && state.last[s.id]) m.push(relTime(state.last[s.id]));
    if (sort === 'plays' && state.plays[s.id]) m.push(state.plays[s.id] + (state.plays[s.id] === 1 ? ' apertura' : ' aperture'));
    if (it.hitText) m.push('<span class="hit">nel testo</span>');
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

  function openSong(id) {
    var s = byId[id];
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
    requestWakeLock();

    var token = ++loadToken;
    fetch(songUrl(s)).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (t) {
      if (token !== loadToken) return;
      maxCols = columns(t);
      els.text.className = '';
      els.text.textContent = t;
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
    else location.hash = '#/';
  }
  $('backBtn').addEventListener('click', goBack);

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
    var m = location.hash.match(/^#\/song\/([\w-]+)/);
    if (m) openSong(m[1]);
    else showList();
  }
  window.addEventListener('hashchange', route);

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
      favs: state.favs, plays: state.plays, last: state.last, settings: state.settings }, null, 1);
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
      save();
      applySettings();
      render();
      menuMsg.textContent = 'Importato: ' + n + ' preferiti uniti a quelli già presenti.';
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

  function fillFolders() {
    var seen = {};
    songs.forEach(function (s) { seen[s.folder] = (seen[s.folder] || 0) + 1; });
    Object.keys(seen).sort(function (a, b) {
      if (!a) return -1; if (!b) return 1;
      return collator.compare(a, b);
    }).forEach(function (f) {
      var o = document.createElement('option');
      o.value = f;
      o.textContent = folderLabel(f) + ' (' + seen[f] + ')';
      els.folder.appendChild(o);
    });
  }

  fetch('songs.json', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (data) {
    meta = data;
    songs = data.songs || [];
    songs.forEach(function (s) {
      s._key = foldSearch(s.artist + ' ' + s.title + ' ' + s.folder);
      s._text = ' ' + (s.text || '') + ' ';
      byId[s.id] = s;
    });
    fillFolders();
    applySettings();
    render();
    updateHeadHeight();
    route();
    setupServiceWorker();
  }).catch(function () {
    els.list.innerHTML = '<p class="empty">Impossibile caricare songs.json.</p>';
    updateHeadHeight();
  });
})();
