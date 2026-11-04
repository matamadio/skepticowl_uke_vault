/* Modalità "A capo": manda a capo il testo di una canzone alla larghezza dello
   schermo senza spostare gli accordi rispetto alle parole.

   - Le tab diventano spazi (stop a 8 colonne, come Notepad): ogni carattere ha
     una colonna precisa.
   - Riga di accordi + riga di testo: vanno a capo insieme, nello stesso punto
     (uno spazio del testo, mai dentro il nome di un accordo).
   - Blocchi di tablatura (e gli accordi scritti sopra): tutte le righe vanno a
     capo nella stessa colonna, preferibilmente su una battuta |, senza
     spezzare i numeri; il nome della corda si ripete.
   - Il resto va a capo tra le parole.
   Le righe senza un punto dove spezzare (link, ****, parole lunghissime)
   restano più larghe dello schermo. */
(function (root) {
  'use strict';

  var SUFFIX = '(?:maj|min|m|M|dim|aug|sus|add|\\+|°|ø)?(?:\\d{1,2})?' +
    '(?:(?:maj|sus|add|aug|dim|b|#|\\+)\\d{0,2}|-\\d{1,2})*(?:\\([^)\\s]{1,8}\\))?';
  var EN = '[A-G](?:#|b)?', IT = '(?:Do|Re|Mi|Fa|Sol|La|Si)(?:#|b)?';
  var CHORD_EN = new RegExp('^' + EN + SUFFIX + '(?:/' + EN + ')?$');
  var CHORD_IT = new RegExp('^' + IT + SUFFIX + '(?:/' + IT + ')?$');
  var TAB_LINE = /^\s*[A-Ga-g][#b]?\s*[|:]?-*[|:]?[-0-9hpbr\/\\~x|]{4,}/;
  var TAB_BARE = /^[-0-9hpbrsvx~\/\\|().*^ ]+$/;
  var NOISE = /^(?:x\d+|\d+x|[-|\/.:%*]+|\(?x?\d+\)?|n\.?c\.?|\d{4})$/i;
  var LABEL = /^\s*[A-Ga-g][#b]?\s*[|:]/;

  function expandTabs(text) {
    return text.split('\n').map(function (line) {
      if (line.indexOf('\t') === -1) return line;
      var out = '';
      for (var i = 0; i < line.length; i++) {
        var c = line.charAt(i);
        if (c === '\t') out += new Array(8 - (out.length % 8) + 1).join(' ');
        else out += c;
      }
      return out;
    }).join('\n');
  }

  // 'blank' | 'tab' | 'chord' | 'text' (stesse regole di build.py)
  function classify(line) {
    if (!line.trim()) return 'blank';
    if (TAB_LINE.test(line)) return 'tab';
    var core = line.trim();
    if (core.length >= 8 && TAB_BARE.test(core) && (core.match(/-/g) || []).length >= 0.4 * core.length) return 'tab';
    var toks = line.replace(/\[[^\]\s]{1,16}\]/g, ' ').split(/[\s|]+/).map(function (t) {
      return CHORD_EN.test(t) ? t : t.replace(/^[()\[\],;!?.]+|[()\[\],;!?.]+$/g, '');
    }).filter(function (t) { return t && !NOISE.test(t); });
    if (!toks.length) return 'text';
    var n = toks.filter(function (t) { return CHORD_EN.test(t) || CHORD_IT.test(t); }).length;
    return n >= 0.6 * toks.length ? 'chord' : 'text';
  }

  // Riga di accordi + riga di testo -> [[accordi, testo], ...]
  function wrapPair(ch, ly, W) {
    var spans = [], re = /\S+/g, m, starts = {};
    while ((m = re.exec(ch))) { spans.push([m.index, m.index + m[0].length]); starts[m.index] = 1; }
    var L = Math.max(ch.length, ly.length), out = [], start = 0, c, b;
    function ok(p) {
      for (var i = 0; i < spans.length; i++) if (spans[i][0] < p && p < spans[i][1]) return false;
      return p >= ly.length || ly.charAt(p) === ' ' || (p > 0 && ly.charAt(p - 1) === ' ');
    }
    function chordAfter(p) {
      for (var i = 0; i < spans.length; i++) if (spans[i][0] >= p) return true;
      return false;
    }
    while (start < L) {
      if (L - start <= W) { out.push([ch.slice(start), ly.slice(start)]); break; }
      b = null;
      for (c = start + W; c > start; c--) if (ok(c)) { b = c; break; }
      if (b === null) {
        for (c = start + W + 1; c < L; c++) if (ok(c)) { b = c; break; }
        if (b === null) b = L;
      }
      out.push([ch.slice(start, b), ly.slice(start, b)]);
      // il pezzo successivo comincia dalla prossima parola (o dal prossimo accordo)
      var nxt = b;
      while (nxt < L && !starts[nxt] && (nxt >= ly.length || ly.charAt(nxt) === ' ')) {
        if (nxt >= ly.length && !chordAfter(nxt)) { nxt = L; break; }
        nxt++;
      }
      start = nxt;
    }
    return out;
  }

  function wrapText(line, W) {
    var out = [], start = 0;
    while (line.length - start > W) {
      var b = line.slice(start, start + W + 1).lastIndexOf(' ');
      if (b <= 0) {
        var k = line.indexOf(' ', start + W);
        if (k < 0) break;
        b = k - start;
      }
      out.push(line.slice(start, start + b).replace(/\s+$/, ''));
      start += b;
      while (line.charAt(start) === ' ') start++;
    }
    out.push(line.slice(start));
    return out;
  }

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isAlnum(c) { return /[A-Za-z0-9]/.test(c); }

  // Blocco di righe di tablatura -> righe; tagli tutti nelle stesse colonne
  function wrapTab(block, W, cutsOut) {
    var M = 0, i;
    block.forEach(function (l) { if (l.length > M) M = l.length; });
    var lines = block.map(function (l) { return l + new Array(M - l.length + 1).join(' '); });
    var lab = lines.map(function (l) { var m = LABEL.exec(l); return m ? m[0].trim() : ''; });
    var labw = Math.min(4, Math.max.apply(null, lab.map(function (x) { return x.length; })));
    var segs = [], start = 0, first = true;
    while (start < M) {
      var avail = Math.max(Math.floor(W / 2), W - (first ? 0 : labw));
      if (M - start <= avail) { segs.push([start, M]); break; }
      var b = null, c, best = Infinity;
      // pezzi di lunghezza simile: il taglio ideale divide il resto in parti uguali
      var rest = M - start, parts = Math.ceil(rest / avail);
      var target = start + Math.ceil(rest / parts);
      // meglio dopo una battuta comune a tutte le righe di tablatura, vicino al taglio ideale
      for (c = start + avail; c > start + Math.max(1, Math.floor(avail / 3)); c--) {
        var bar = lines.every(function (l) { return !(l.trim() && l.indexOf('-') !== -1) || l.charAt(c - 1) === '|'; });
        var split = lines.some(function (l) { return isAlnum(l.charAt(c - 1)) && isAlnum(l.charAt(c)); });
        if (bar && !split && Math.abs(c - target) < best) { b = c; best = Math.abs(c - target); }
      }
      if (b === null) {
        for (c = Math.min(target, start + avail); c > start; c--) {
          var bad = lines.some(function (l) {
            var x = l.charAt(c - 1), y = l.charAt(c);
            return (isDigit(x) && isDigit(y)) || (/[A-Za-z]/.test(x) && ' -|'.indexOf(y) === -1);
          });
          if (!bad) { b = c; break; }
        }
        if (b === null) b = start + avail;
      }
      b = Math.max(b, start + 1);
      segs.push([start, b]);
      start = b;
      first = false;
    }
    if (cutsOut) segs.forEach(function (s) { cutsOut.push(s); });
    var out = [];
    segs.forEach(function (s, k) {
      if (k) out.push('');
      lines.forEach(function (l, j) {
        var pre = k ? (lab[j] + '    ').slice(0, labw) : '';
        out.push((pre + l.slice(s[0], s[1])).replace(/\s+$/, ''));
      });
    });
    return out;
  }

  // details (facoltativo) raccoglie coppie e blocchi per i test
  function reflow(text, W, details) {
    var lines = expandTabs(text).split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
    var kinds = lines.map(classify), out = [], i = 0;
    while (i < lines.length) {
      var k = kinds[i];
      // accordi scritti sopra una tablatura: vanno a capo con il blocco
      if (k === 'chord' && kinds[i + 1] === 'tab') { kinds[i] = k = 'tab'; }
      if (k === 'chord' && kinds[i + 1] === 'text') {
        var segs = wrapPair(lines[i], lines[i + 1], W);
        if (details) details.pairs.push({ ch: lines[i], ly: lines[i + 1], segs: segs });
        segs.forEach(function (s) {
          if (s[0].trim()) out.push(s[0].replace(/\s+$/, ''));
          if (s[1].trim()) out.push(s[1].replace(/\s+$/, ''));
        });
        i += 2;
        continue;
      }
      if (k === 'tab') {
        var j = i;
        while (j < lines.length && kinds[j] === 'tab') j++;
        var cuts = [];
        out = out.concat(wrapTab(lines.slice(i, j), W, cuts));
        if (details) details.tabs.push({ block: lines.slice(i, j), cuts: cuts });
        i = j;
        continue;
      }
      out = out.concat(wrapText(lines[i], W));
      i++;
    }
    return out.join('\n');
  }

  root.Reflow = { reflow: reflow, expandTabs: expandTabs, classify: classify, wrapPair: wrapPair };
})(typeof window !== 'undefined' ? window : module.exports);
