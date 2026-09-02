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
    *   **CSS 注入**: UI 构建必须使用 SDK 提供的 `createPluginCssIsolationPlugins(pluginId)`，配置唯一的 `styleId`（建议使用插件名），以确保样式能在插件动态加载时正确注入并去重。
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

**严禁全局样式污染**：主程序按 Vuetify 官方文档采用 Tailwind 主导的样式体系（CSS layer 顺序为 `tailwind-theme → tailwind-reset → vuetify-* → tailwind-utilities → vuetify-final`，`tailwind-utilities` 位于 `vuetify-utilities` 之上；与 Tailwind 冲突的 Vuetify 工具类按需禁用，Vuetify 运行时主题工具类与调色板保留，`dark:`/`light:` 变体跟随 `.v-theme--*`，断点与 Vuetify 阈值对齐）。内嵌插件样式由宿主 app 运行时放入 `translime-plugin` layer，并通过 `@scope (.plugin-ui-loader[data-plugin-id="插件ID"])` 限制选择器匹配范围。

如果你在插件开发中使用了 Tailwind CSS，必须同时遵守以下规则：

1. **使用 SDK 注入封装**：UI 构建保留 `createPluginCssIsolationPlugins(pluginId)`。它负责 CSS 提取、运行时注入、样式 ID 去重和插件专用 layer；构建阶段保留原始选择器，由宿主 app 完成 `@scope` 包裹。
2. **使用插件专用 layer**：在你的 `index.css` 或主样式文件中，将 Tailwind 的引入放在唯一的 `@layer` 中（降权）：
    ```css
    @layer plugin_your_name {
      @import "tailwindcss";
    }
    ```
3. **在主组件外层限制 Prefix (针对 v3)**：配置 `prefix: 'tw-'`，并在最外层使用唯一的 wrapper class。
4. **禁用预设重置 (Preflight)**：如果你不需要全局 reset，不要在样式中包含 preflight，以防修改宿主的 button、svg 默认表现。

宿主会兼容插件 CSS 中直接或前置使用的 `:root`、`:host`、`html`、`body` 规则，将其映射为作用域内的 `:scope`。`@scope` 只限制选择器匹配范围；继承属性以及 `@keyframes`、`@font-face`、`@property` 等全局命名空间继续遵循浏览器原生语义，相关名称应保持插件内唯一。

## 8. Sass 移除后的 UI 迁移规范

项目不再提供 Sass 编译链。插件 UI 应使用普通 CSS：

* 不要在 Vue 样式块中使用 `lang="scss"` 或 `lang="sass"`。
* 不要使用 Sass 专用的变量、`@use`、`@forward`、mixin 或嵌套语法；嵌套选择器改写为完整的扁平选择器，例如 `.plugin-main .red {}`。
* UI 构建必须将 `vue` externalize，并保留 SDK 提供的 CSS 注入与隔离封装。
* 修改 UI 构建后，应重新构建插件并在宿主内重载；`preview:ui` 只能用于辅助验证。
