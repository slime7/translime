---
trigger: always_on
description: 当开发 packages 目录下以 translime-plugin- 开头的插件时必须遵循此文档。
---

# Translime 插件开发规范

在开发 `packages` 目录下以 `translime-plugin-` 开头的插件项目时，必须遵循本规范。

## 1. 核心参考文档

*   **开发指引**: 遵循 [packages/template-translime-plugin/readme.md](../../packages/template-translime-plugin/readme.md) 中的架构和调试说明。
*   **集成接口**: 使用 [packages/sdk/README.md](../../packages/sdk/README.md) 中提供的 SDK 接口。

## 2. 环境隔离与 SDK 使用

SDK 提供的函数具有严格的运行环境限制，开发时必须区分：

*   **主进程 (Main Process)**: 源码通常为 `src/main.js` 或 `index.js`。
    *   可用：`getMainStore()`, `usePluginConfig(pluginId)`。
    *   禁用：`useIpc()`, `useWindowControl()`, `useDialog()` 等 UI 相关 Hook。
*   **渲染进程 (Renderer Process)**: 源码通常为 `src/ui.vue`。
    *   可用：`useIpc()`, `useVuetifyComponents()`, `getPluginSetting()`, `setPluginSetting()`, `useWindowControl()`, `openLink()` 等。
    *   禁用：`getMainStore()` 等直接访问 Node.js 主进程 Store 的函数。

## 3. 编译与模块规范

*   **模块格式**:
    *   **主进程入口**: 源码使用 **MJS**，Vite 编译目标必须为 **CJS** (`formats: ['cjs']`)，输出文件名通常为 `index.cjs.js`。
    *   **UI 渲染入口**: 源码使用 **MJS/Vue**，Vite 编译目标必须为 **ESM** (`formats: ['esm']`)，输出文件名通常为 `ui.esm.js`。
*   **Vite 构建要求**:
    *   **推荐**在 `plugins` 中包含 `translimeSdk()`。
    *   **CSS 注入**: UI 构建必须强制使用 `vite-plugin-css-injected-by-js` 插件，并配置唯一的 `styleId`（建议使用插件名），以确保样式能在插件动态加载时正确注入。
    *   **依赖外部化**: `vue` 必须被列入 `external`（由 SDK 处理或手动配置），避免重复打包 Vue 源码。
    *   **构建目标**: `target` 统一设置为 `node20` 或以上。

## 4. UI 组件与图标规范

*   **组件库**: 核心 UI 必须基于 `Vuetify 3`。
*   **图标规范**: 
    *   组件库默认选用 **Material Design Icons (md)** 风格，建议写法为 `<v-icon icon="home" />` 或 `<v-icon>home</v-icon>`。
    *   **严禁使用 `mdi-` 前缀的图标名**（例如 `mdi-home` 是无效的）。
*   **图标文件**: 插件图标（`plugin.icon`）是**可选**项。若提供，可存放在项目内**任何位置**，只需在 `package.json` 中准确指定路径。

## 5. 插件元数据 (package.json)

必须包含 `plugin` 字段，且 ID 必须全局唯一（与包名一致）。`icon` 为选填项：

```json
{
  "name": "translime-plugin-example",
  "main": "dist/index.cjs.js",
  "plugin": {
    "title": "显示标题",
    "description": "功能描述",
    "icon": "./assets/icon.png",
    "ui": "dist/ui.esm.js"
  }
}
```

## 6. IPC 通信规范

*   所有 `ipc.invoke` 调用必须遵循 `事件名@插件ID` 的格式，例如：`ipc.invoke('get-data@translime-plugin-example')`。
*   在主进程对应的 `ipcHandlers` 中，处理函数会自动解构出 `sendToClient` 等工具。