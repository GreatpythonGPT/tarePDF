# Tare Studio 2.2 构建

```sh
npm ci
npm run compile
npm test
npm run test:e2e
```

Windows x64 便携版：

```sh
npm run dist -- --win portable --x64
```

Linux 可运行目录：

```sh
npm run dist -- --linux dir --x64
```

macOS DMG 需在 macOS 上构建和验证：

```sh
npm run dist -- --mac dmg
```

产物位于 `dist/`。前端编译产物在 `app/`，两者均不加入 Git。运行时使用全部本地资源，没有 CDN 依赖。`electron-builder` 的 `signAndEditExecutable: false` 用于未签名 Windows 构建，免除跨平台打包对 Wine 的需求；签名发布应在 Windows CI 上配置证书并开启可执行文件元数据编辑。

原版本中值为 `false` 的构建钩子已移除。删除了未使用的 sharp、electron-store、electron-packager，以及未接入或重复初始化的旧渲染模块。字体使用附带开放许可的 Noto Sans SC，避免依赖系统微软雅黑。

云端无显示器环境：

```sh
TARE_E2E_NO_SANDBOX=1 xvfb-run -a -s '-screen 0 1600x1050x24' npm run test:e2e
```

完整 E2E 会在 `test-results/` 生成作品、PDF、PNG、界面截图和结果 JSON。测试使用独立配置目录，不读取或修改已有作品。打包后可设置 `TAREPDF_EXECUTABLE` 指向应用，重复同一套检查。

## 发布可直接下载的应用

`.github/workflows/release.yml` 在推送 `v2.2.0` 这类版本标签时运行，也可从 Actions 手动指定已有标签。标签必须匹配 `package.json` 的版本。

流程在 Windows 上安装锁定依赖、运行单元测试、构建便携版，并对打包后的程序运行单图编辑、模板标注、整组编排三套交互测试。测试通过后，整理程序、两份可编辑示例及对应预览 PDF、中文说明和 SHA-256 校验文件；独立发布任务将完整附件上传到草稿，再公开 Releases 页面，并重新下载校验。

只有发布任务拥有 `contents: write` 权限。未通过测试的包不会进入发行版；发布操作不会覆盖已有发行版。

本地打包文件仍位于 `dist/Tare Studio 版本号.exe`；公开附件使用 `Tare-Studio-版本号-Windows-x64.exe` 名称。常用下载入口为 <https://github.com/GreatpythonGPT/tarePDF/releases/latest>。
