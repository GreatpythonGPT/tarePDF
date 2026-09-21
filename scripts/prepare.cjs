'use strict';
const fs = require('node:fs');
const path = require('node:path');
const directory = path.join(__dirname, '..', 'src', 'renderer', 'vendor');
fs.mkdirSync(directory, { recursive: true });
fs.copyFileSync(require.resolve('pdf-lib/dist/pdf-lib.min.js'), path.join(directory, 'pdf-lib.min.js'));
fs.copyFileSync(path.join(path.dirname(require.resolve('pdf-lib/package.json')), 'LICENSE.md'), path.join(directory, 'pdf-lib.LICENSE.md'));
console.log('Local PDF runtime prepared. No CDN is used.');
