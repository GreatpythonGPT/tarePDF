'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(filename);
    else if (/\.[cm]?js$/.test(filename)) execFileSync(process.execPath, ['--check', filename], { stdio: 'inherit' });
  }
}
for (const directory of ['src', 'scripts', 'tests']) visit(path.join(root, directory));
for (const name of ['imageProcessor.js', 'imageManager.js', 'settingsManager.js', 'pdfGenerator.js', 'utils.js', 'main.js']) {
  if (fs.existsSync(path.join(root, 'src/renderer/scripts', name))) throw new Error(`Obsolete module remains: ${name}`);
}
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
if (/<script[^>]+src=["']https?:/i.test(html) || /\bonclick=/i.test(html)) throw new Error('Unsafe HTML script source');
console.log('Syntax and removed-module checks passed.');
