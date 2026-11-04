#!/usr/bin/env node
/* Verifica la modalità "A capo" (reflow.js) su tutte le canzoni di songs/.

   Uso: node tools/test_reflow.js [cartella] [larghezze]
        node tools/test_reflow.js songs 24,30,36,45

   Per ogni larghezza controlla che:
   - in ogni coppia accordi + testo, sotto ogni accordo resti la stessa lettera;
   - nessun carattere del testo o degli accordi vada perso;
   - nelle tablature nessun numero di tasto venga spezzato.
   Esce con codice 1 se trova errori. Le righe rimaste più larghe dello schermo
   sono solo contate (succede quando non c'è un punto dove spezzare). */
'use strict';
var fs = require('fs');
var path = require('path');
var Reflow = require('../reflow.js').Reflow;

var root = process.argv[2] || path.join(__dirname, '..', 'songs');
var widths = (process.argv[3] || '24,30,36,45').split(',').map(Number);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (acc, e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) return acc.concat(walk(p));
    return /\.txt$/i.test(e.name) ? acc.concat([p]) : acc;
  }, []);
}

// [accordo, lettera sotto l'accordo (o null se oltre la fine del testo)]
function chordMap(ch, ly) {
  var out = [], re = /\S+/g, m;
  while ((m = re.exec(ch))) out.push(m[0] + '@' + (m.index < ly.length ? ly.charAt(m.index) : ''));
  return out.join(' ');
}
function noSpaces(s) { return s.replace(/ /g, ''); }

var files = walk(root).sort();
var failed = false;
widths.forEach(function (W) {
  var pairs = 0, tabs = 0, errors = [], over = 0, overFiles = {}, total = 0;
  files.forEach(function (f) {
    var text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    var d = { pairs: [], tabs: [] };
    var out = Reflow.reflow(text, W, d).split('\n');
    total += out.length;
    out.forEach(function (l) { if (l.length > W) { over++; overFiles[f] = 1; } });
    d.pairs.forEach(function (p) {
      pairs++;
      var segCh = p.segs.map(function (s) { return s[0]; }), segLy = p.segs.map(function (s) { return s[1]; });
      var after = p.segs.map(function (s) { return chordMap(s[0], s[1]); }).filter(Boolean).join(' ');
      if (chordMap(p.ch, p.ly) !== after) errors.push(['accordo spostato', f, p.ch.trim(), p.ly.trim()]);
      if (noSpaces(segLy.join('')) !== noSpaces(p.ly)) errors.push(['testo perso', f, p.ly.trim()]);
      if (noSpaces(segCh.join('')) !== noSpaces(p.ch)) errors.push(['accordi persi', f, p.ch.trim()]);
    });
    d.tabs.forEach(function (t) {
      tabs++;
      var M = Math.max.apply(null, t.block.map(function (l) { return l.length; }));
      t.cuts.forEach(function (c) {
        var s = c[0];
        if (s <= 0 || s >= M) return;
        t.block.forEach(function (l) {
          if (/\d/.test(l.charAt(s - 1)) && /\d/.test(l.charAt(s))) errors.push(['numero spezzato', f, l.trim()]);
        });
      });
    });
  });
  console.log('W=' + W + ': ' + files.length + ' file, ' + pairs + ' coppie accordi+testo, ' + tabs +
    ' blocchi di tablatura, errori ' + errors.length + ', righe più larghe ' + over + ' su ' + total +
    ' (in ' + Object.keys(overFiles).length + ' file)');
  errors.slice(0, 10).forEach(function (e) { console.log('   ' + e.join(' | ')); });
  if (errors.length) failed = true;
});
process.exit(failed ? 1 : 0);
