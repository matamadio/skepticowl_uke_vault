/* Accordi per ukulele (GCEA): da nome a diteggiatura, e disegno SVG. */
(function (root) {
  'use strict';
  var NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, Do: 0, Re: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };
  var STRINGS = [7, 0, 4, 9]; // G C E A (corde a vuoto, dall'alto)

  // Diteggiature "da manuale" per gli accordi più comuni; per gli altri si calcola.
  var COMMON = {
    'C': '0003', 'C7': '0001', 'Cm': '0333', 'Cmaj7': '0002', 'Cm7': '3333', 'Csus4': '0013', 'Csus2': '0233', 'C6': '0000', 'Cadd9': '0203', 'Cdim': '2323', 'Caug': '1003',
    'C#': '1114', 'C#7': '1112', 'C#m': '1104', 'C#m7': '1102',
    'D': '2220', 'D7': '2223', 'Dm': '2210', 'Dmaj7': '2224', 'Dm7': '2213', 'Dsus4': '0230', 'Dsus2': '2200', 'D6': '2222',
    'D#': '0331', 'D#m': '3321', 'D#7': '3334',
    'E': '4442', 'E7': '1202', 'Em': '0432', 'Emaj7': '1302', 'Em7': '0202', 'Esus4': '4452', 'E5': '4477',
    'F': '2010', 'F7': '2313', 'Fm': '1013', 'Fmaj7': '2410', 'Fm7': '1313', 'Fsus4': '3011', 'Fsus2': '0013', 'F6': '2213',
    'F#': '3121', 'F#7': '3424', 'F#m': '2120', 'F#m7': '2424',
    'G': '0232', 'G7': '0212', 'Gm': '0231', 'Gmaj7': '0222', 'Gm7': '0211', 'Gsus4': '0233', 'Gsus2': '0230', 'G6': '0202',
    'G#': '5343', 'G#7': '1323', 'G#m': '4342',
    'A': '2100', 'A7': '0100', 'Am': '2000', 'Amaj7': '1100', 'Am7': '0000', 'Asus4': '2200', 'Asus2': '2452', 'A6': '2424',
    'A#': '3211', 'A#7': '1211', 'A#m': '3111', 'A#maj7': '3210', 'A#m7': '1111',
    'B': '4322', 'B7': '2322', 'Bm': '4222', 'Bmaj7': '3322', 'Bm7': '2222', 'Bsus4': '4422'
  };
  var FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
  var PC_NAME = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function parse(name) {
    var m = /^(Do|Re|Mi|Fa|Sol|La|Si|[A-G])(#|b)?(.*?)(?:\/(Do|Re|Mi|Fa|Sol|La|Si|[A-G])(#|b)?)?$/.exec(name);
    if (!m) return null;
    var rootPc = (NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
    var q = m[3].replace(/[()]/g, '');
    var third = 4, fifth = 7, seventh = null, ext = [], fifthAltered = false, power = false;
    var rest = q, k;
    function eat(re) { var r = re.exec(rest); if (r) rest = rest.slice(r[0].length); return r; }
    var maj = false;
    if (eat(/^(maj|M(?!in))/)) maj = true;
    else if (eat(/^(min|m(?!aj)|-(?=\d|$))/)) third = 3;
    else if (eat(/^(dim|°)/)) { third = 3; fifth = 6; fifthAltered = true; if (eat(/^7/)) seventh = 9; }
    else if (eat(/^(aug|\+)(?!\d)/)) { fifth = 8; fifthAltered = true; }
    else if (eat(/^ø/)) { third = 3; fifth = 6; seventh = 10; fifthAltered = true; }
    if (/^m/.test(rest) && third === 4 && !maj) { /* es. "mmaj7" gestito sotto */ }
    if ((k = eat(/^(13|11|9|7|6|5|4|2)/))) {
      var n = k[1];
      if (n === '5') power = true;
      else if (n === '6') ext.push(9);
      else if (n === '2') ext.push(2);
      else if (n === '4') third = 5;
      else {
        seventh = maj ? 11 : 10;
        if (n === '9') ext.push(2);
        if (n === '11') ext.push(5);
        if (n === '13') ext.push(9);
      }
    } else if (maj) seventh = 11; // "Cmaj" = C maggiore con settima? no: "Cmaj" = C
    if (maj && !k && !/7/.test(q)) seventh = null;
    while (rest.length) {
      if ((k = eat(/^sus(2|4)?/))) third = k[1] === '2' ? 2 : 5;
      else if ((k = eat(/^add(#|b)?(\d{1,2})/))) ext.push(degree(k[2], k[1]));
      else if ((k = eat(/^maj7?/))) seventh = 11;
      else if ((k = eat(/^(b|-)5/))) { fifth = 6; fifthAltered = true; }
      else if ((k = eat(/^(#|\+)5?/))) { fifth = 8; fifthAltered = true; }
      else if ((k = eat(/^(b|#)(9|11|13)/))) ext.push(degree(k[2], k[1]));
      else if ((k = eat(/^(\d{1,2})/))) ext.push(degree(k[1], ''));
      else rest = rest.slice(1); // ignoto: si salta
    }
    var tones = [0], required = [0];
    if (!power) { tones.push(third); required.push(third); }
    tones.push(fifth); if (fifthAltered || power) required.push(fifth);
    if (seventh !== null) { tones.push(seventh); required.push(seventh); }
    ext.forEach(function (e) { if (tones.indexOf(e) === -1) { tones.push(e); required.push(e); } });
    if (required.length > 4) required = required.filter(function (t) { return t !== 0; }); // troppe note: via la fondamentale
    var bass = m[4] ? (NOTES[m[4]] + (m[5] === '#' ? 1 : m[5] === 'b' ? 11 : 0)) % 12 : null;
    if (bass !== null) {
      var b = (bass - rootPc + 12) % 12;
      if (tones.indexOf(b) === -1) { tones.push(b); if (required.length < 4) required.push(b); }
    }
    return { root: rootPc, tones: tones.map(function (t) { return (t + rootPc) % 12; }),
      required: required.map(function (t) { return (t + rootPc) % 12; }), slash: bass !== null };
  }
  function degree(d, acc) {
    var map = { 2: 2, 4: 5, 6: 9, 9: 2, 11: 5, 13: 9, 3: 4, 5: 7 };
    var v = map[d]; if (v === undefined) v = 2;
    return (v + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
  }

  function cost(f) {
    var fretted = f.filter(function (x) { return x > 0; });
    if (!fretted.length) return 0;
    var min = Math.min.apply(null, fretted), max = Math.max.apply(null, fretted);
    var atMin = fretted.filter(function (x) { return x === min; }).length;
    var fingers = fretted.length - (atMin >= 2 && fretted.length === 4 ? atMin - 1 : 0);
    if (fingers > 4 || max - min > 3) return Infinity;
    var open = f.length - fretted.length;
    return max * 1.2 + (max - min) * 1.0 + fingers * 0.8 + fretted.reduce(function (a, b) { return a + b; }, 0) * 0.15 +
      (max > 5 && open ? 1.5 : 0); // corde a vuoto con la mano in alto: scomodo
  }

  function search(ch, limit) {
    var out = [];
    for (var a = 0; a <= 12; a++) for (var b = 0; b <= 12; b++) for (var c = 0; c <= 12; c++) for (var d = 0; d <= 12; d++) {
      var f = [a, b, c, d], ok = true, have = {};
      for (var i = 0; i < 4; i++) {
        var pc = (STRINGS[i] + f[i]) % 12;
        if (ch.tones.indexOf(pc) === -1) { ok = false; break; }
        have[pc] = 1;
      }
      if (!ok) continue;
      for (var j = 0; j < ch.required.length; j++) if (!have[ch.required[j]]) { ok = false; break; }
      if (!ok) continue;
      var c0 = cost(f);
      if (c0 === Infinity) continue;
      if (!have[ch.root]) c0 += 1.5;
      if (ch.tones.length === 3 && Object.keys(have).length < 3) c0 += 2;
      out.push({ frets: f, cost: c0 });
    }
    out.sort(function (x, y) { return x.cost - y.cost; });
    // tieni posizioni diverse
    var res = [], seen = {};
    for (var n = 0; n < out.length && res.length < (limit || 3); n++) {
      var key = Math.min.apply(null, out[n].frets.filter(function (x) { return x > 0; }).concat([99]));
      if (seen[key] && res.length) continue;
      seen[key] = 1; res.push(out[n].frets);
    }
    return res;
  }

  function fromString(s) {
    return s.split('').map(function (c) { return c === 'x' || c === 'X' ? -1 : Number(c); });
  }

  // Fino a 4 diteggiature: quella scritta nel file (custom), quella "da
  // manuale", poi quelle calcolate in altre posizioni del manico.
  var cache = {};
  function shapes(name, custom) {
    var key = name + '|' + (custom || '');
    if (cache[key]) return cache[key];
    var ch = parse(name), res = [];
    function add(f) {
      var k = f.join(',');
      if (!res.some(function (r) { return r.join(',') === k; })) res.push(f);
    }
    if (custom) add(fromString(custom));
    if (ch) {
      var canon = canonical(name);
      if (canon && COMMON[canon]) add(fromString(COMMON[canon]));
      search(ch, 4).forEach(add);
    }
    return (cache[key] = res.slice(0, 4));
  }

  // Diagramma SVG: corde verticali G C E A, 4 tasti, pallini sulle note
  function svg(name, frets, label) {
    var W = 64, H = 88, x0 = 13, y0 = 30, dx = 13, dy = 13, nf = 4;
    var played = frets.filter(function (f) { return f > 0; });
    var max = played.length ? Math.max.apply(null, played) : 0;
    var base = max <= nf ? 1 : Math.min.apply(null, played);
    var o = ['<svg class="chord" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      esc(name) + ' ' + frets.map(function (f) { return f < 0 ? 'x' : f; }).join('') + '">'];
    o.push('<text x="' + (W / 2) + '" y="12" class="cn">' + esc(name) + '</text>');
    for (var s = 0; s < 4; s++) o.push('<line x1="' + (x0 + s * dx) + '" y1="' + y0 + '" x2="' + (x0 + s * dx) + '" y2="' + (y0 + nf * dy) + '"/>');
    for (var r = 0; r <= nf; r++) {
      o.push('<line x1="' + x0 + '" y1="' + (y0 + r * dy) + '" x2="' + (x0 + 3 * dx) + '" y2="' + (y0 + r * dy) + '"' +
        (r === 0 && base === 1 ? ' class="nut"' : '') + '/>');
    }
    if (base > 1) o.push('<text x="' + (x0 - 4) + '" y="' + (y0 + dy * 0.75) + '" class="fr">' + base + '</text>');
    frets.forEach(function (f, i) {
      var x = x0 + i * dx;
      if (f < 0) o.push('<text x="' + x + '" y="' + (y0 - 4) + '" class="mx">×</text>');
      else if (f === 0) o.push('<circle cx="' + x + '" cy="' + (y0 - 7) + '" r="2.8" class="open"/>');
      else o.push('<circle cx="' + x + '" cy="' + (y0 + (f - base + 0.5) * dy) + '" r="4.6" class="dot"/>');
    });
    if (label) o.push('<text x="' + (W / 2) + '" y="' + (H - 1) + '" class="alt">' + label + '</text>');
    o.push('</svg>');
    return o.join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // "Bb" -> "A#", "Lam" -> "Am" (per cercare nella tabella)
  function canonical(name) {
    var m = /^(Do|Re|Mi|Fa|Sol|La|Si|[A-G])(#|b)?(.*)$/.exec(name);
    if (!m || /\//.test(name)) return null;
    var pc = (NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
    var q = m[3].replace(/^min(?!or)/, 'm').replace(/^M7$/, 'maj7').replace(/^-$/, 'm');
    return PC_NAME[pc] + q;
  }

  root.UkeChords = { parse: parse, shapes: shapes, svg: svg };
})(typeof window !== 'undefined' ? window : module.exports);
