const esbuild = require('esbuild');
const fs = require('node:fs/promises');
(async () => {
  await fs.mkdir('app', { recursive: true });
  await esbuild.build({ entryPoints: ['src/editor/app.mjs', 'src/editor/image.worker.mjs'], outdir: 'app', bundle: true, platform: 'browser', format: 'iife', target: 'chrome140', sourcemap: true, minify: true });
  await fs.copyFile('src/editor/index.html', 'app/index.html');
  await fs.copyFile('src/editor/style.css', 'app/style.css');
})().catch(error => { console.error(error); process.exitCode = 1; });
