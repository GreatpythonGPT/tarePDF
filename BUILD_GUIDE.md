# Tare PDF Generator 构建打包指南

## 📦 快速构建

### 方法一：使用electron-packager（推荐）
```bash
# 1. 安装依赖
npm install

# 2. 使用electron-packager打包
npx electron-packager . Tare-PDF-Generator --platform=win32 --arch=x64 --out=dist --overwrite

# 3. 检查输出
dir dist\Tare-PDF-Generator-win32-x64
```

### 方法二：使用批处理脚本
```bash
# Windows
.\build.bat
```

### 方法三：使用electron-builder（可能遇到代码签名问题）
```bash
# 1. 安装依赖
npm install

# 2. 构建应用
npm run build

# 3. 检查输出
dir dist
```

## 📋 构建配置详情

### 输出位置
- **主要输出目录**: `dist/`
- **electron-packager输出**: `dist/Tare-PDF-Generator-win32-x64/`
- **可执行文件**: `dist/Tare-PDF-Generator-win32-x64/Tare-PDF-Generator.exe`
- **electron-builder输出**: `dist/win-unpacked/` (如果成功)

### 构建格式
- **推荐格式**: Portable应用 (electron-packager)
- **备选格式**: NSIS安装包 (electron-builder)
- **目标架构**: x64
- **支持平台**: Windows 10/11

### 应用特性
- ✅ 绿色便携版本
- ✅ 无需安装即可运行
- ✅ 包含所有依赖文件
- ✅ 支持字体和资源文件
- ✅ 完整的Electron运行时

## 📋 构建要求

### 系统要求
- Windows 10/11
- Node.js 16+ 
- npm 或 yarn

### 依赖包
- `electron`: Electron 框架
- `electron-builder`: 打包工具
- `pdf-lib`: PDF 生成库
- `sharp`: 图像优化
- `electron-store`: 配置存储

## 🚀 分发指南

### 安装包信息
- **应用名称**: Tare PDF Generator
- **发布者**: Tare PDF Generator
- **应用ID**: com.tarepdf.generator
- **执行权限**: 用户级别（无需管理员权限）

### 分发建议
1. **文件大小**: 约 200-300MB（包含 Electron 运行时）
2. **系统兼容**: Windows 10/11 x64
3. **安装要求**: 无需额外依赖
4. **字体支持**: 内置微软雅黑字体

## 🔧 高级配置

### 自定义图标
如需自定义应用图标：
1. 准备 256x256 的 ICO 文件
2. 放置在 `assets/icon.ico`
3. 更新 `package.json` 中的图标路径：
```json
"win": {
  "icon": "assets/icon.ico"
}
```

### 代码签名（可选）
为了避免 Windows Defender 警告：
1. 获取代码签名证书
2. 在 `package.json` 中添加签名配置：
```json
"win": {
  "certificateFile": "path/to/certificate.p12",
  "certificatePassword": "password"
}
```

## 📝 构建日志

构建过程中的关键步骤：
1. **依赖安装**: 下载所需的 npm 包
2. **资源打包**: 将源代码、字体、资源文件打包
3. **Electron 打包**: 创建 Electron 应用包
4. **NSIS 安装包**: 生成 Windows 安装程序

## ❗ 常见问题

### 代码签名问题（electron-builder）
**问题**: 构建时出现代码签名相关错误
**解决方案**:
1. **推荐**: 使用 `electron-packager` 代替 `electron-builder`
2. 或者在 `package.json` 中禁用代码签名:
   ```json
   "build": {
     "forceCodeSigning": false,
     "win": {
       "sign": false
     }
   }
   ```

### 构建失败
**问题**: `npm run build` 失败
**解决方案**:
1. 删除 `node_modules` 文件夹
2. 删除 `package-lock.json`
3. 重新运行 `npm install`
4. 尝试使用 `electron-packager` 代替

### 字体问题
**问题**: 生成的PDF中文显示异常
**解决方案**:
1. 确保 `fonts/` 目录存在
2. 检查字体文件是否完整
3. 重新构建应用

### 权限问题
**问题**: Windows上构建时权限不足
**解决方案**:
1. 以管理员身份运行命令提示符
2. 或者使用 `--no-optional` 参数安装依赖

### 安装包过大
- 正常现象，Electron 应用包含完整的 Chromium 运行时
- 可以考虑使用 `electron-builder` 的压缩选项

## 📞 技术支持

如遇到构建问题，请检查：
1. 构建日志输出
2. `dist/` 文件夹内容
3. 系统环境配置

---

**最后更新**: 2024-12-31  
**构建工具版本**: electron-builder 24.9.1