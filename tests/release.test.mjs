import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const { releaseVersion, digest, checkedRun, prepareRelease } = createRequire(import.meta.url)('../scripts/release.cjs');

test('发布标签必须匹配程序版本，拒绝分支名与不一致的版本号', () => {
  assert.equal(releaseVersion('v2.1.0', '2.1.0'), '2.1.0');
  for (const tag of ['main', 'v2.0.0', undefined, 'v2.1.0\nother=value', 'v2.1.0-beta']) assert.throws(() => releaseVersion(tag, '2.1.0'));
});
test('失败或不完整的打包程序测试不能用于发布', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tare-release-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const run = path.join(root, 'run'); await fs.mkdir(run); await fs.writeFile(path.join(root, 'latest.txt'), run);
  for (const result of [{ status: 'failed', checks: ['one'], errors: [] }, { status: 'passed', checks: [], errors: [] }, { status: 'passed', checks: ['one'], errors: ['error'] }]) {
    await fs.writeFile(path.join(run, 'results.json'), JSON.stringify(result)); await assert.rejects(checkedRun(root, 'latest.txt', 1));
  }
  await fs.writeFile(path.join(root, 'latest.txt'), path.dirname(root)); await assert.rejects(checkedRun(root, 'latest.txt', 1));
});
test('发行附件包含应用和测试生成的示例，校验值对应实际内容', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tare-package-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const testRoot = path.join(root, 'results'), run = path.join(testRoot, 'run');
  await fs.mkdir(run, { recursive: true }); await fs.mkdir(path.join(root, 'dist'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '2.1.0' }));
  await fs.writeFile(path.join(root, 'dist', 'Tare Studio 2.1.0.exe'), 'MZfixture executable');
  await fs.writeFile(path.join(run, 'results.json'), JSON.stringify({ status: 'passed', checks: Array.from({ length: 15 }, (_, i) => `check ${i}`), errors: [] }));
  for (const pointer of ['latest.txt', 'latest-annotations.txt', 'latest-collection.txt']) await fs.writeFile(path.join(testRoot, pointer), run);
  await fs.writeFile(path.join(run, '弧光·可编辑标注示例.tare'), 'editable sample'); await fs.writeFile(path.join(run, '标注预览.pdf'), '%PDF-fixture');
  await fs.writeFile(path.join(run, '统一宽度编排示例.tare'), 'collection sample'); await fs.writeFile(path.join(run, '批量编排预览.pdf'), '%PDF-collection');
  await fs.mkdir(path.join(root, 'dist', 'release')); await fs.writeFile(path.join(root, 'dist', 'release', 'old-version.exe'), 'stale');
  const release = await prepareRelease({ root, testRoot, tag: 'v2.1.0' }); assert.equal(release.assets.length, 7);
  assert(!(await fs.readdir(release.destination)).includes('old-version.exe'));
  const checksums = await fs.readFile(path.join(release.destination, 'SHA256SUMS.txt'), 'utf8');
  for (const name of release.assets.filter(n => n !== 'SHA256SUMS.txt')) assert(checksums.includes(`${await digest(path.join(release.destination, name))}  ${name}\n`));
  assert((await fs.readFile(path.join(release.destination, 'release-notes.md'), 'utf8')).includes('Tare-Studio-2.1.0-Windows-x64.exe'));
});
