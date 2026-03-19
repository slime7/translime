# Translime App Memo

> **⚠ 以上信息有变动或更新时及时同步修改此文件。**

基于 Electron 的模块化插件桌面应用。工作区: `packages/app`(核心), `packages/sdk`, `packages/template-translime-plugin`。

## 技术栈

Electron + Vue 3 + Vuetify 3 + Tailwind CSS v4 + Vite + Pinia + Axios + electron-store + winston + vitest

源码 ESM (`"type": "module"`)，构建: 主进程→CJS, 渲染进程→ESM。

## 目录结构

```
src/
├─ main/            # 主进程 (Node.js)
│  ├─ core/          # pluginLoader / ipcHandler / pluginInterop / autoUpdate / Ipc / tray
│  ├─ utils/
│  ├─ index.js       # 入口
│  └─ launch.js
├─ renderer/         # 渲染进程 (Vue 3)
│  ├─ assets/ components/ hooks/ router/ store/ views/
│  └─ App.vue
├─ share/            # 主/渲染共享代码
└─ preload/          # 预加载脚本
```

## 关键模块

| 文件 | 职责 |
|---|---|
| `pluginLoader.js` | 插件扫描、验证、动态加载与生命周期管理 |
| `ipcHandler.js` | 主进程响应渲染进程请求 |
| `pluginInterop.js` | 插件间通信与资源共享 |
| `autoUpdate.js` | 基于 electron-updater 的自动更新 |

## 开发规范

- **图标**: Material Design Icons (md) 风格，**禁用 `mdi-` 前缀**，写法: `<v-icon icon="home" />`
- **插件环境隔离**: 主进程用 `getMainStore()`/`usePluginConfig()`，渲染进程用 `useIpc()`/`getPluginSetting()` 等
- **插件 UI**: 强制 Vuetify 3，CSS 通过 `vite-plugin-css-injected-by-js` 注入

## 命令

`pnpm run dev` | `pnpm run build` | `pnpm test`

## AI 协作注意

- 改主进程逻辑时同步更新 `ipcHandler`
- UI 优先参考 Vuetify 3 文档 + Tailwind CSS
- 新 API 遵循 `packages/sdk` 暴露规范
