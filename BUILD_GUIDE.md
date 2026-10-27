# Tare Studio 2.1 构建

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
