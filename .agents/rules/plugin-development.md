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

*   **组件库**: 核心 UI 必须基于 `Vuetify 4`。
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

## 7. 样式隔离与 Tailwind CSS 规范

**严禁全局样式污染**：主程序启用了 Vuetify 并按需禁用了部分功能，且为 Tailwind 配置了 `@layer tailwind` 以降低默认优先级。若插件随意注入（如直接 `@import "tailwindcss";`），其生成的非级联级 (Unlayered) 样式**将直接覆盖并破坏主程序**的响应式网格 (`md:grid-cols-3` 等)。

如果你在插件开发中使用了 Tailwind CSS，**必须**采取以下任意一种样式隔离手段：
1. **作用域包裹**：在你的 `index.css` 或主样式文件中，将 tailwind 的引入放在唯一的 `@layer` 中（降权）：
    ```css
    @layer plugin_your_name {
      @import "tailwindcss";
    }
    ```
2. **在主组件外层限制 Prefix (针对 v3)**：配置 `prefix: 'tw-'`，并在最外层使用唯一的 wrapper class。
3. **禁用预设重置 (Preflight)**：如果你不需要全局 reset，不要在样式中包含 preflight，以防修改宿主的 button、svg 默认表现。
