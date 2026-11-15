#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'models') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(html|js|css|json)$/i.test(entry.name)) sourceFiles.push(full);
  }
}
walk(publicDir);
const source = sourceFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
const modelsDir = path.join(publicDir, 'models');
if (!fs.existsSync(modelsDir)) {
  console.error('Missing public/models directory');
  process.exit(1);
}
const models = fs.readdirSync(modelsDir).filter(name => /\.glb$/i.test(name));
const referenced = models.filter(name => source.includes(name));
const unreferenced = models.filter(name => !source.includes(name));
console.log('3D asset audit');
console.log('--------------');
console.log('GLB models found: ' + models.length);
console.log('Referenced by browser source: ' + referenced.length);
console.log('Not directly referenced: ' + unreferenced.length);
if (unreferenced.length) {
  console.log('\nReview these assets before deleting them:');
  for (const name of unreferenced) {
    const bytes = fs.statSync(path.join(modelsDir, name)).size;
    console.log('  ' + name + ' (' + (bytes / 1048576).toFixed(2) + ' MB)');
  }
}
console.log('\nAudit complete. Unreferenced does not necessarily mean unused at runtime.');
