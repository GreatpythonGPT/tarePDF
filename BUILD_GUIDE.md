# tarePDF 2：构建与验证

Windows 10/11 x64，Node.js 22.16+。在仓库根目录运行：

```powershell
npm ci
npm run check
npm test
npm run test:e2e
npm run dist
```

输出：`dist/tarePDF-2.0.0-win-x64.exe`，便携版，无需安装。构建不上传 Release；GitHub Actions 将便携版作为构建产物提供。代码未配置信任证书签名，Windows 可能显示未知发布者提示；请核对下载来源，勿把未签名包当成已完成签名发行的产品。

`npm ci` 使用锁文件，`prepare` 将已安装的 pdf-lib 拷贝到本地渲染资源目录，并保留其许可声明。Electron 44 在需要时下载运行时；CI 显式执行 `node node_modules/electron/install.js`。任何依赖下载失败应先解决安装问题，不要删除锁文件随意换版本。

应用打包仅包含 src、assets、生产依赖与 package 元数据。不会打包 fonts 文件夹、测试截图、用户配置或开发依赖。字体使用目标机器已有字体；不要把系统字体复制进发行包。

开发：`npm run dev`。普通运行：`npm start`。Linux 测试：`xvfb-run -a npm run test:e2e`。无图形界面容器的 root 测试进程可能需要测试脚本中的 `--no-sandbox`；生产应用保留 Electron 沙箱，不要修改生产启动参数关闭沙箱。

用户数据文件：Electron `app.getPath('userData')` 下的 `workspace-v2.json`，开发与便携版按 Electron 应用身份确定目录。升级仍保留原 package name、appId 和 productName。旧 `config.json` 只读迁移，不删除。问题排查时先备份用户数据目录。

测试成功不代替目标机器验收：检查中文本机字体、不同 DPI、多显示器、真实客户图片、大批量文稿、文件锁定/无权限，以及在手机或 iPad 的目标 PDF 阅读器中的显示。
