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
| `pluginLoader.js` | 插件扫描、manifest 解析、依赖图、声明式激活、生命周期管理 |
| `ipcHandler.js` | 主进程响应渲染进程请求，并提供插件激活/命令执行入口 |
| `pluginInterop.js` | 插件间通信与资源共享 |
| `autoUpdate.js` | 基于 electron-updater 的自动更新 |

## 插件加载机制

当前插件系统已从“启动时加载所有已启用插件”调整为“描述符扫描 + 按触发激活”：

- 启动时只扫描插件 manifest，不默认执行所有插件主逻辑。
- 未声明 `plugin.activationEvents` 的旧插件，默认等价于 `["onStartup"]`，保持兼容。
- 宿主目前支持的触发时机：
  - `onStartup`
  - `onAppReady`
  - `onView`
  - `onCommand:<commandId>`
  - `onIpc:<ipcType>`
- 插件 UI 仍然是页面进入时动态加载；主进程插件逻辑现在也支持在真正需要时再激活。

## 插件 Manifest 约定

插件继续在 `package.json.plugin` 中声明元数据。新增的推荐字段如下：

```json
{
  "plugin": {
    "activationEvents": ["onView"],
    "dependencies": ["translime-plugin-foo"],
    "optionalDependencies": ["translime-plugin-bar"],
    "contributes": {
      "commands": [
        {
          "id": "translime-plugin-example.run",
          "title": "Run Example"
        }
      ]
    }
  }
}
```

字段说明：

- `activationEvents`: 插件激活时机，缺省时默认 `["onStartup"]`
- `dependencies`: 硬依赖，启用插件前应先满足
- `optionalDependencies`: 可选依赖，仅用于能力发现，不阻止启用
- `contributes.commands`: 静态命令声明，宿主可在插件未激活时先根据命令反向激活插件

## 依赖与状态

- `pluginLoader` 会在扫描后构建依赖关系与激活索引。
- 插件状态目前包含：
  - `discovered`
  - `ready`
  - `activating`
  - `active`
  - `blocked`
  - `build-missing`
  - `load-error`
- 插件卡片会优先展示：
  - 依赖阻塞
  - 需要构建
  - 加载失败
  - 被其他插件依赖

## 对开发者的影响

- 新插件默认推荐用 `activationEvents` 控制加载时机，不要把重初始化逻辑全部堆到应用启动阶段。
- 如果插件暴露命令，先在 manifest 中声明，再在主进程导出 `commands` 运行时处理函数。
- 如果插件依赖另一个插件提供的 API，优先在 manifest 中声明 `dependencies` 或 `optionalDependencies`，`pluginInterop` 只负责已激活插件之间的通信。

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
