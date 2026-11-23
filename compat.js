/* Compatibilità con i browser vecchi (Firefox 52 su tablet Android 4.0).
   Ogni pezzo si attiva solo se la funzione manca: nei browser recenti non fa nulla.
   Va caricato prima degli altri script. */
(function () {
  'use strict';

  // Firefox per Android prima del 56 non ha né Intl né String.normalize.
  // Qui basta togliere gli accenti (NFD usato da fold), non serve la scomposizione vera.
  if (!String.prototype.normalize) {
    var BASE = {
      a: 'àáâãäåāăą', c: 'çćĉċč', d: 'ď', e: 'èéêëēĕėęě', g: 'ĝğġģ', h: 'ĥ', i: 'ìíîïĩīĭį', j: 'ĵ',
      k: 'ķ', l: 'ĺļľ', n: 'ñńņň', o: 'òóôõöōŏő', r: 'ŕŗř', s: 'śŝşšș', t: 'ţťț',
      u: 'ùúûüũūŭůűų', w: 'ŵ', y: 'ýÿŷ', z: 'źżž'
    };
    var PLAIN = {};
    Object.keys(BASE).forEach(function (b) {
      BASE[b].split('').forEach(function (c) {
        PLAIN[c] = b;
        PLAIN[c.toUpperCase()] = b.toUpperCase();
      });
    });
    Object.defineProperty(String.prototype, 'normalize', {
      configurable: true,
      writable: true,
      value: function (form) {
        if (form !== 'NFD' && form !== 'NFKD') return String(this);
        return String(this).replace(/[\u00c0-\u024f]/g, function (c) { return PLAIN[c] || c; });
      }
    });
  }

  // Ordine alfabetico: senza accenti, senza maiuscole, con i numeri in ordine numerico
  if (typeof Intl === 'undefined' || !Intl.Collator) {
    var keys = {};
    var sortKey = function (s) {
      s = String(s);
      if (!Object.prototype.hasOwnProperty.call(keys, s)) {
        keys[s] = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/\d+|\D+/g) || [];
      }
      return keys[s];
    };
    var rank = function (c) { // spazio, punteggiatura, numeri, lettere (come Intl)
      if (c === undefined) return 0;
      if (/\s/.test(c)) return 1;
      return /[a-z\u00c0-\u1fff\u2c00-\u2dff\u3040-\ud7ff]/.test(c) ? 4 : /\d/.test(c) ? 3 : 2;
    };
    var cmpText = function (a, b) {
      for (var i = 0; i < a.length || i < b.length; i++) {
        var x = a[i], y = b[i];
        if (x !== y) return (rank(x) - rank(y)) || (x < y ? -1 : 1);
      }
      return 0;
    };
    var compare = function (a, b) {
      var x = sortKey(a), y = sortKey(b);
      for (var i = 0; i < x.length && i < y.length; i++) {
        var num = /^\d/.test(x[i]) && /^\d/.test(y[i]);
        var r = num ? Number(x[i]) - Number(y[i]) : cmpText(x[i], y[i]);
        if (r) return r;
      }
      return x.length - y.length;
    };
    if (typeof Intl === 'undefined') window.Intl = {};
    window.Intl.Collator = function () { this.compare = compare; };
  }

  // matchMedia(...).addEventListener('change', ...)
  if (window.matchMedia) {
    var mq = window.matchMedia('(min-width: 1px)');
    if (!mq.addEventListener && mq.addListener) {
      window.MediaQueryList.prototype.addEventListener = function (type, fn) {
        if (type === 'change') this.addListener(fn);
      };
    }
  }

  // file.text() (ripristino da copia)
  if (window.Blob && !Blob.prototype.text) {
    Blob.prototype.text = function () {
      var blob = this;
      return new Promise(function (ok, no) {
        var r = new FileReader();
        r.onload = function () { ok(r.result); };
        r.onerror = function () { no(r.error); };
        r.readAsText(blob);
      });
    };
  }

  // <dialog>: apertura, chiusura, Esc e <form method="dialog">
  Array.prototype.forEach.call(document.querySelectorAll('dialog'), function (d) {
    if (d.showModal) return;
    d.classList.add('compat');
    Object.defineProperty(d, 'open', {
      configurable: true,
      get: function () { return d.hasAttribute('open'); },
      set: function (v) { if (v) d.setAttribute('open', ''); else d.removeAttribute('open'); }
    });
    d.show = d.showModal = function () { d.open = true; };
    d.close = function () { d.open = false; };
    d.addEventListener('submit', function (e) { e.preventDefault(); d.close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.open) { e.preventDefault(); e.stopPropagation(); d.close(); }
    }, true);
  });

  // Firefox vecchio (prima del 61): position: sticky si muove a scatti e con centinaia
  // di elementi si blocca. Barre fisse (style.css, .ff-old) e un'unica etichetta con
  // l'artista corrente al posto dei nomi adesivi.
  if (window.CSS && CSS.supports && CSS.supports('-moz-appearance', 'none') && !CSS.supports('gap', '1px')) {
    var root = document.documentElement;
    root.classList.add('ff-old');
    var head = document.querySelector('#listView .sticky');
    var vbar = document.querySelector('#viewer .vbar');
    var list = document.getElementById('list');
    var label = document.createElement('div');
    label.className = 'group curgroup';
    label.hidden = true;
    label.setAttribute('aria-hidden', 'true');
    head.appendChild(label);

    var marks = null; // posizioni delle intestazioni, ricalcolate quando cambia l'elenco
    var shown = null, queued = false;
    var readMarks = function () {
      marks = Array.prototype.map.call(list.querySelectorAll('.group, .section'), function (el) {
        return { el: el, top: el.getBoundingClientRect().top + window.pageYOffset };
      });
    };
    var update = function () {
      queued = false;
      if (head.offsetParent === null && !head.offsetHeight) return; // elenco nascosto
      if (!marks) readMarks();
      var y = window.pageYOffset + head.offsetHeight, lo = 0, hi = marks.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (marks[mid].top <= y) lo = mid + 1; else hi = mid;
      }
      var el = lo ? marks[lo - 1].el : null;
      if (el && !el.classList.contains('group')) el = null;
      if (el === shown) return;
      shown = el;
      label.hidden = !el;
      if (el) label.innerHTML = el.innerHTML;
    };
    var queue = function () {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(update);
    };
    var layout = function () {
      if (head.offsetHeight) root.style.setProperty('--head-h', head.offsetHeight + 'px');
      if (vbar.offsetHeight) root.style.setProperty('--vbar-h', vbar.offsetHeight + 'px');
      marks = null;
      shown = undefined;
      queue();
    };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', layout);
    window.addEventListener('load', layout);
    // elenco ridisegnato o spostato (filtri), barra del visualizzatore più alta o più bassa
    var watch = function (el, opts) { new MutationObserver(layout).observe(el, opts); };
    watch(list, { childList: true });
    watch(document.querySelector('.listhead'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    watch(vbar, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    watch(document.getElementById('viewer'), { attributes: true, attributeFilter: ['hidden'] });
    watch(document.getElementById('listView'), { attributes: true, attributeFilter: ['hidden'] });
    layout();
  }
})();
