# Translime 插件开发指北
本指北将介绍如何开发和调试 Translime 插件。
## 本地开发测试
利用 `link` 命令将本地插件包添加到 Translime 的开发目录中进行测试。
> [!IMPORTANT]
> 请统一使用同一种包管理器（建议使用 `pnpm`），避免混用导致依赖冲突。
### 方式一：直接链接本地路径（推荐）
1. 在项目主目录下的 `plugins_dev` 目录中打开终端。
2. 运行以下命令：
   ```
   pnpm link <插件包的绝对路径>
   ```

### 方式二：通过全局链接

1. 在插件包根目录中运行：
   ```
   pnpm link --global
   ```
2. 在项目主目录的 `plugins_dev` 目录下运行：
   ```
   pnpm link --global <package.json 中的 name>
   ```

### 启用开发插件
打开 Translime 客户端，在 **设置** 中开启 **"显示开发中插件"** 选项。完成后，在插件管理界面即可看到并启用你的本地插件。
---

## 插件元数据配置 (`package.json`)

插件的入口信息和展示信息需要在 `package.json` 的 `plugin` 字段中定义。
```json5
{
  "name": "your-plugin-name",
  "version": "1.0.0",
  "main": "./dist/index.cjs.js",
  "plugin": {
    "title": "插件标题",
    "description": "插件的功能描述",
    "icon": "src/icon.svg",
    "ui": "dist/ui.esm.js",
    "windowUrl": "dist/index.html",
    "windowUrl.dev": "http://localhost:3000"
  }
}
```

---

## 插件后端逻辑 (`index.js`)

插件的后端逻辑需通过 `export` 导出特定的配置和钩子。

### 1. 设置菜单 (`settingMenu`)

如果你希望在插件详情页提供配置项，可以导出 `settingMenu` 数组。

### 2. 生命周期钩子

- `pluginDidLoad`: 插件启用或应用加载完成后执行。
- `pluginWillUnload`: 插件禁用或应用关闭前执行。
- `pluginSettingSaved`: 插件设置在 UI 界面保存后触发。

### 3. IPC 通信 (`ipcHandlers`)

插件可以通过 `ipcHandlers` 定义与前端 UI 交互的接口。

### 4. 额外菜单 (`pluginMenu`)

你可以在 Translime 的部分位置添加自定义菜单。

---

## 使用 Translime SDK

推荐通过 `translime-sdk` 访问插件配置、IPC、窗口控制和 UI 组件能力。

---

## 初始化补充说明

创建或接手一个插件包后，建议立刻补齐下面这些基础项：

1. 首次可用发布默认从 `1.0.0` 开始；只有在明确延续旧版本线时才保留原版本号。
2. 如果插件带 Web UI，需要同时补齐 `preview:ui` 的 mock 数据和交互，保证浏览器里可以直接调试主要流程。
3. 把功能性逻辑拆到单独模块，避免全部堆在 `index.js` 或 `ui.vue` 中。
4. 为包内补上 `test` 脚本和单元测试，至少覆盖关键的数据转换、请求参数构造和错误处理。
5. 完成构建后，分别验证 `build`、`test` 和 `preview:ui` 三条链路。
