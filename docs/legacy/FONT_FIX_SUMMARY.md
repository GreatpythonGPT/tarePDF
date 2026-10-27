# 字体加载和中文显示问题修复总结

## 问题描述
1. 字体加载有问题，无法有效连接到本地字库
2. 无法正常显示中文文字
3. 需要连接微软雅黑字体（msyh.ttc, msyhbd.ttc, msyhl.ttc）

## 修复内容

### 1. 修复字体文件路径问题 (src/main.js)
- 修改了 `get-custom-fonts` IPC处理器
- 区分开发环境和打包环境的字体文件路径
- 开发环境使用 `path.join(__dirname, '..', 'fonts')`
- 打包环境使用 `path.join(process.resourcesPath, 'fonts')`
- 添加了备用路径机制

### 2. 支持.ttc字体文件格式 (src/main.js)
- 在字体文件过滤器中添加了 `.ttc` 扩展名支持
- 特殊处理微软雅黑字体文件名映射：
  - `msyh.ttc` → `Microsoft YaHei`
  - `msyhbd.ttc` → `Microsoft YaHei Bold`
  - `msyhl.ttc` → `Microsoft YaHei Light`

### 3. 实现字体动态加载 (src/renderer/scripts/settingsManager.js)
- 重写了 `loadCustomFonts()` 方法
- 使用 `FontFace` API 动态加载字体文件
- 将字体文件转换为 base64 格式加载
- 添加到 `document.fonts` 集合中

### 4. 改进字体列表获取 (src/renderer/scripts/settingsManager.js)
- 修改 `getAvailableFonts()` 方法
- 合并自定义字体和系统字体列表
- 去重处理，优先显示自定义字体

### 5. 优化PDF生成中的字体使用 (src/renderer/scripts/pdfGenerator.js)
- 在 `addChineseTextAsImage()` 方法中改进字体检测
- 检查字体是否已加载到 `document.fonts`
- 构建智能的字体回退列表
- 优先使用已加载的自定义字体

### 6. 更新构建配置 (package.json)
- 在 `electron-builder` 配置中添加 `fonts/**/*`
- 确保字体文件被正确打包到应用中

## 技术要点

### 字体加载流程
1. 应用启动时，`settingsManager` 初始化
2. 调用 `loadCustomFonts()` 加载本地字体文件
3. 通过 IPC 获取字体文件列表和数据
4. 使用 `FontFace` API 创建字体面
5. 加载字体并添加到文档字体集合

### 中文显示原理
1. PDF生成时检测文本是否包含中文字符
2. 如果包含中文，使用Canvas绘制文本
3. 检查目标字体是否已加载
4. 构建字体回退列表确保显示正常
5. 将Canvas内容转换为图片嵌入PDF

### 字体文件处理
- 支持 .ttf, .otf, .ttc 格式
- 特殊处理微软雅黑的三个变体
- Base64编码传输字体数据
- 错误处理和日志记录

## 验证方法
1. 启动应用：`npm run dev`
2. 检查控制台日志，确认字体加载成功
3. 在参数设置页面查看字体下拉列表
4. 输入中文标题文本
5. 生成PDF测试中文显示效果

## 预期效果
- 微软雅黑字体正确加载并可选择
- 中文文本在PDF中正常显示
- 字体回退机制确保兼容性
- 开发和生产环境都能正常工作