# 第三方组件与资源

| 组件 | 版本 | 来源 | 许可 |
| --- | --- | --- | --- |
| Konva | 10.9.0 | https://github.com/konvajs/konva | MIT |
| pdf-lib | 1.17.1 | https://github.com/Hopding/pdf-lib | MIT |
| Electron | 45.0.0 | https://github.com/electron/electron | MIT；Chromium 等第三方许可随运行时提供 |
| Noto Sans SC | Google Fonts 变量字体 | https://github.com/google/fonts/tree/main/ofl/notosanssc | SIL Open Font License 1.1，见 assets/fonts/OFL.txt |

依赖精确版本和传递依赖校验值记录在 package-lock.json。打包的 Electron 自带 LICENSE / LICENSES.chromium.html。Konva、pdf-lib 的许可证副本存放在 assets/licenses/。

内置三张空间示例为本项目原创 SVG 插画，源代码位于 src/editor/demo.mjs。图片调整的像素处理代码位于 src/editor/filters.mjs；交互、变形和文本测量使用 Konva，未复制来源不明的图片算法。
