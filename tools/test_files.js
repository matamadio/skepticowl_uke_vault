#!/usr/bin/env node
/* Controlla che ogni canzone e ogni canzoniere elencati in songs.json e
   canzonieri.json abbia un file con esattamente quel nome (maiuscole
   comprese: GitHub Pages le distingue, Windows no).
   Uso: node tools/test_files.js */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

// elenco dei file con il nome esatto (fs.existsSync su Windows/macOS ignorerebbe le maiuscole)
function listing(dir) {
  var out = {};
  (function walk(d, rel) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else out[r] = 1;
    });
  })(dir, '');
  return out;
}
var problems = [];
function check(listFile, dir, items) {
  var have = listing(path.join(root, dir)), lower = {};
  Object.keys(have).forEach(function (k) { lower[k.toLowerCase()] = k; });
  items.forEach(function (p) {
    if (have[p]) return;
    var other = lower[p.toLowerCase()];
    problems.push(listFile + ': "' + p + '" ' + (other ? 'ha un nome diverso nelle maiuscole: "' + other + '"' : 'non esiste'));
  });
}
var songs = JSON.parse(fs.readFileSync(path.join(root, 'songs.json'), 'utf8')).songs;
check('songs.json', 'songs', songs.map(function (s) { return s.path; }));
var books = JSON.parse(fs.readFileSync(path.join(root, 'canzonieri.json'), 'utf8')).items;
check('canzonieri.json', 'canzonieri', books.map(function (b) { return b.path; }));
console.log(songs.length + ' canzoni e ' + books.length + ' canzonieri controllati, problemi: ' + problems.length);
problems.forEach(function (p) { console.log('   ' + p); });
process.exit(problems.length ? 1 : 0);
