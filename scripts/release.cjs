const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function releaseVersion(tag, version) {
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${version}`) {
    throw new Error(`发行标签必须与 package.json 版本一致：v${version}`);
  }
  return version;
}
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function checkedRun(root, pointer, minimumChecks) {
  const directory = path.resolve((await fs.readFile(path.join(root, pointer), 'utf8')).trim());
  const relative = path.relative(path.resolve(root), directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('测试结果目录必须位于本次测试目录内');
  const result = JSON.parse(await fs.readFile(path.join(directory, 'results.json'), 'utf8'));
  if (result.status !== 'passed' || !Array.isArray(result.checks) || result.checks.length < minimumChecks || !Array.isArray(result.errors) || result.errors.length) {
    throw new Error('打包程序的交互测试尚未全部通过，不能发布');
  }
  return directory;
}
async function prepareRelease({ root, tag, testRoot }) {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const version = releaseVersion(tag, pkg.version);
  await checkedRun(testRoot, 'latest.txt', 15);
  const annotations = await checkedRun(testRoot, 'latest-annotations.txt', 7);
  const collection = await checkedRun(testRoot, 'latest-collection.txt', 8);
  const executable = path.join(root, 'dist', `Tare Studio ${version}.exe`);
  const handle = await fs.open(executable, 'r');
  try {
    const magic = Buffer.alloc(2); await handle.read(magic, 0, 2, 0);
    if (magic.toString() !== 'MZ') throw new Error('发行文件不是 Windows 可执行程序');
  } finally { await handle.close(); }
  const destination = path.join(root, 'dist', 'release');
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const appName = `Tare-Studio-${version}-Windows-x64.exe`;
  const sampleName = `Tare-Studio-${version}-sample.tare`;
  const pdfName = `Tare-Studio-${version}-preview.pdf`;
  const collectionName = `Tare-Studio-${version}-collection.tare`, collectionPDF = `Tare-Studio-${version}-collection-preview.pdf`;
  const sources = [[executable, appName], [path.join(annotations, '弧光·可编辑标注示例.tare'), sampleName], [path.join(annotations, '标注预览.pdf'), pdfName], [path.join(collection, '统一宽度编排示例.tare'), collectionName], [path.join(collection, '批量编排预览.pdf'), collectionPDF]];
  for (const [source, target] of sources) await fs.copyFile(source, path.join(destination, target));
  const instructions = `Tare Studio ${version} · Windows 便携版

下载 ${appName}，双击运行，无需安装 Node.js 或下载源码。
导入一批不同尺寸图片后，自动进入“整组编排”：统一宽度、拖动排序，在右侧设置开头标题条和图片间横条。
可在“连续预览”和“缩略图排序”之间切换，点击“编辑此图”继续文字与标注编辑。
打开“标注 → 体验产品标注示例”，即可尝试三张图片同步修改。

六种标注：直线、箭头、斜折线、直角、双向尺寸线、编号指示。
模板可以点击添加或拖入图片，右侧可调角度、各段长度、端点、线型与文字位置。
“保存作品”保留全部可编辑内容；“导出作品”生成 PDF 或 PNG。
${sampleName} 是可编辑示例，用程序顶部“打开作品”打开。
${pdfName} 可以直接查看效果。
${collectionName} 是批量图片编排示例，${collectionPDF} 是对应的 PDF 效果。

源码与自动生成的 Source code.zip 供开发使用，普通用户只需下载 .exe。
此版本没有代码签名。作品保存在本地；建议保留独立的 .tare 文件作为备份。
`;
  await fs.writeFile(path.join(destination, 'README-Windows.txt'), instructions);
  const assets = [...sources.map(([, target]) => target), 'README-Windows.txt'];
  const checksums = [];
  for (const name of assets) checksums.push(`${await digest(path.join(destination, name))}  ${name}`);
  await fs.writeFile(path.join(destination, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  const notes = `## 下载应用

**Windows 用户请在下方 Assets 下载 \`${appName}\`，双击运行。无需下载源码或安装 Node.js。**

导入一批不同尺寸的图片，就会自动进入“整组编排”。在右侧设统一宽度、开头标题条和图片间横条；拖动图片调整顺序，勾选多张可以一起移动。

需要细修某张图时点“编辑此图”；文字排版和模板标注仍然保留。

## 这个版本可以做什么

- 批量图片统一宽度（100–5000 px），按原比例排列；连续预览和缩略图排序。
- 可调高度、颜色、字号、对齐和文字的开头标题条；可调高度、颜色的图片间横条。
- 直线、箭头、折线、直角、双向尺寸线、编号等六种可拖入标注。
- 分别调整角度、斜段长度、横段长度、端点、线型和文字位置。
- 可编辑文字排版、图片调色与裁剪，多张图共享整套排版或单个元素。
- 保存可编辑 .tare 作品，导出 PDF 和 PNG。

## 附件

- \`${appName}\`：Windows x64 应用程序。
- \`${sampleName}\`：可编辑的产品标注示例。
- \`${pdfName}\`：效果预览。
- \`${collectionName}\`：可编辑的批量图片编排示例。
- \`${collectionPDF}\`：统一宽度、标题条和分隔横条的 PDF 预览。
- \`README-Windows.txt\`：中文使用说明。
- \`SHA256SUMS.txt\`：附件校验值。

发行流程在 Windows 环境构建并运行单图编辑、模板标注、整组编排三套交互测试，通过后才公开附件。此便携版尚未进行代码签名。
`;
  await fs.writeFile(path.join(destination, 'release-notes.md'), notes);
  return { version, tag, destination, assets: [...assets, 'SHA256SUMS.txt'] };
}
module.exports = { releaseVersion, digest, checkedRun, prepareRelease };
if (require.main === module) (async () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const tag = process.env.RELEASE_TAG;
  const version = releaseVersion(tag, pkg.version);
  if (process.argv[2] === 'check') {
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\nversion=${version}\n`);
    console.log(`发行版本：${tag}`);
  } else if (process.argv[2] === 'prepare') {
    const result = await prepareRelease({ root, tag, testRoot: process.env.TARE_TEST_OUTPUT || path.join(root, 'test-results', 'windows-packaged') });
    console.log(JSON.stringify(result, null, 2));
  } else throw new Error('用法：node scripts/release.cjs check | prepare');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
