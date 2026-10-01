# Translime SDK

Translime 官方插件 SDK，提供插件开发常用的运行时 API、类型提示和 Vite 集成能力。

## 安装

```bash
pnpm add translime-sdk
```

## Vite 集成

在插件的 `vite.config.mjs` 中使用 `translimeSdk()`，可以自动处理 `electron` 等依赖的外部化，并支持 preview 模式。

```javascript
import { defineConfig } from 'vite';
import { translimeSdk } from 'translime-sdk/vite';

export default defineConfig({
  plugins: [
    translimeSdk(),
  ],
});
```

## 插件 UI 样式隔离

如果插件 UI 通过 `vite-plugin-css-injected-by-js` 注入样式，推荐直接使用 SDK 提供的样式隔离封装，而不是手写注入逻辑。

```javascript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { translimeSdk, createPluginCssIsolationPlugins } from 'translime-sdk/vite';

const pluginId = 'translime-plugin-example';

export default defineConfig(({ mode }) => {
  const isPreview = mode === 'preview';

  return {
    plugins: [
      vue(),
      tailwindcss(),
      translimeSdk(),
      ...(!isPreview ? createPluginCssIsolationPlugins(pluginId) : []),
    ],
  };
});
```

这套封装负责 CSS 提取、运行时注入、样式 ID 去重，并将注入内容包进插件专用的 `@layer 插件ID`。构建阶段会保留插件原始选择器，不再改写选择器文本。

插件通过 app 的内嵌渲染路径加载时，宿主会将动态样式包进以下结构，并放入宿主预先声明的 `translime-plugin` layer：

```css
@layer translime-plugin {
  @scope (.plugin-ui-loader[data-plugin-id="插件ID"]) {
    /* 插件原始 CSS */
  }
}
```

宿主会将直接或前置出现的 `:root`、`:host`、`html`、`body` 规则映射到 `:scope`，以兼容插件主题变量和根级规则；其他选择器、声明值以及嵌套 at-rule 保持原始结构。独立 `<webview>` 与 BrowserWindow 继续使用浏览器文档隔离。

`@scope` 限制选择器匹配范围，但继承属性以及 `@keyframes`、`@font-face`、`@property` 等全局命名空间仍遵循浏览器原生语义。插件应继续使用唯一的动画、字体和自定义属性名称，并通过插件专用 `@layer` 控制级联优先级。

## 插件元数据（manifest）编辑期校验

SDK 附带 `translime-plugin.schema.json`，描述插件 `package.json` 的 `plugin` 字段与
`engines.translime` 等约束。在 `package.json` 中引用即可在编辑器中获得字段补全与校验
（写错激活事件、命令缺 id 等问题无需等宿主加载才发现）：

```json
{
  "$schema": "https://slime7.github.io/translime/translime-plugin.schema.json"
}
```

该文件随 `translime-sdk` 一同发布，也会随 `github-page` 部署到上述地址；插件模板的
`package.json` 已默认引用。

## 代码示例

### 主进程

```javascript
import { usePluginConfig } from 'translime-sdk';

const config = usePluginConfig('my-plugin-id');
const myValue = config.get('settingsKey', 'default');
```

### 插件 UI

```javascript
import { useIpc, useVuetifyComponents } from 'translime-sdk';

const ipc = useIpc();
const { VBtn, VCard } = useVuetifyComponents();
```

## 核心 API

### 主进程 (Main Process)

- `getMainStore()`: 获取主程序全局 Store。
- `usePluginConfig(pluginId)`: 获取当前插件配置读写工具。
- `usePluginInterop()`: 获取插件间通信工具。
- `defineIpcHandlers(handlers)`: 定义并校验 `ipcHandlers` 导出：`type` 不需要（也不能）带
  `@插件ID` 后缀，宿主注册通道时自动追加；对缺 `type` / 缺 `handler` / `type` 带 `@` 的
  条目在激活前直接抛错。

```javascript
import { defineIpcHandlers, useLogger } from 'translime-sdk';

export const ipcHandlers = defineIpcHandlers([
  {
    type: 'get-data',
    handler: ({ sendToClient }) => async (query) => ({ ok: true, query }),
  },
]);
```

#### 插件间通信

`usePluginInterop()` 用于在一个插件的主进程代码中访问另一个插件导出的公共 API。

```javascript
import { usePluginInterop } from 'translime-sdk';

const doSomething = async () => {
  const interop = usePluginInterop();
  if (!interop) {
    return;
  }

  const targetApi = interop.getExports('target-plugin-id');
  if (targetApi) {
    targetApi.someMethod();
  }

  try {
    const api = await interop.waitForPlugin('target-plugin-id', 5000);
    api.someMethod();
  } catch (error) {
    console.error('目标插件未就绪', error);
  }
};
```

### 渲染进程 (Renderer Process)

- `useIpc()`: 获取 IPC 工具（事件名需自带 `@插件ID` 后缀）。
- `useIpc(pluginId)`: 获取插件专用 IPC 客户端，`invoke` / `send` / `on` / `detach` 的
  事件名自动补全 `@插件ID` 后缀，无需手拼字符串；显式包含 `@` 的事件名保持原样。

```javascript
import { useIpc } from 'translime-sdk';

const ipc = useIpc('my-plugin-id');
await ipc.invoke('get-data', query);      // 实际调用 'get-data@my-plugin-id'
ipc.on('data-changed', (data) => { ... }); // 接收主进程 sendToClient 推送
```

- `useVuetify()`: 获取 Vuetify 实例。
- `useVuetifyComponents()`: 获取所有 Vuetify 组件。
- `useVuetifyDirectives()`: 获取所有 Vuetify 指令。
- `useMat()` / `useMde()`: 获取宿主提供的 mde-vue 运行时（`{ components, directives, theme }`）。
- `useMatComponents()`: 获取所有宿主注册的 mde-vue 组件（mat-* / mde-*）。
- `useMatDirectives()`: 获取 mde-vue 指令（`v-intersection` / `v-state-layer`）。
- `useDialog()`: 获取 Electron 对话框 API。
- `useShell()`: 获取 Shell API。
- `getPluginSetting(...args)`: 获取插件设置。
- `setPluginSetting(...args)`: 设置插件设置。
- `useWindowControl()`: 获取窗口控制工具。
- `useClipboard()`: 获取剪贴板工具。
- `openLink(...args)`: 在浏览器中打开链接。
- `isPreviewMode()`: 检查当前是否为 preview 模式。
- `electronNetAdapter(config)`: 基于 `window.ts.net` 的 axios adapter。

### mde-vue 支持

宿主 UI 基于 [mde-vue](https://github.com/slime7/mde-vue)（Material 3 Expressive），并通过 `window.mde$` 向插件 UI 提供 mde-vue 运行时。插件无需安装或打包 mde-vue：

```vue
<script setup>
import { useMatComponents, useMat } from 'translime-sdk';

const { MatBtn } = useMatComponents();
// 或整体获取：const mde = useMat(); mde.theme 可读取/跟随宿主主题
</script>

<template>
  <!-- 模板中直接使用 mat-* 标签：SDK 编译期自动注入组件，
       宿主与 preview 环境也均已全局注册 -->
  <MatBtn variant="outlined" @click="reload">刷新</MatBtn>
</template>
```

说明：

- SDK 的 Vite 插件会扫描插件源码中的 `mat-*` / `mde-*` 标签与 `Mat*` / `Mde*` 组件引用，并从 `window.mde$.components` 自动注入，行为与 Vuetify 支持完全一致。
- 宿主与 preview Shell 都通过 `createMatUi` 全局注册了所有 `mat-*` / `Mat*` 组件及 `v-intersection`、`v-state-layer` 指令。
- `window.mde$.theme` 是宿主的 mde-vue 主题控制器（Material 2025 动态主题），可用于读取或跟随宿主的种子色、明暗模式与配色变体。
- 插件本地 preview 想启用 mde 时，在插件中安装 `mde-vue`（GitHub 仓库依赖）即可；未安装时 preview 自动跳过 mde 能力。

### 通用 (Common)

- `useLogger()`: 获取标准日志工具，支持 `log`, `info`, `warn`, `error`, `debug`。

## 网络请求 Adapter

如果插件需要在 UI 渲染层直接发起 HTTP 请求，并复用主程序通过 `window.ts.net` 暴露的网络层，可以使用 SDK 导出的 `electronNetAdapter`。

适用场景：

- 需要在插件 UI 中直接请求远程接口。
- 需要绕过浏览器环境下的跨域限制。
- 需要配合 axios 的 `signal` / `AbortController` 取消请求。

最小示例：

```javascript
import axios from 'axios';
import { electronNetAdapter } from 'translime-sdk';

const response = await axios({
  url: 'https://example.com/api/data',
  method: 'GET',
  adapter: electronNetAdapter,
});

console.log(response.data);
```

也可以在 axios 实例中统一配置：

```javascript
import axios from 'axios';
import { electronNetAdapter } from 'translime-sdk';

const request = axios.create({
  adapter: electronNetAdapter,
});
```

注意事项：

- 该 adapter 仅适用于插件 UI / Renderer，不适用于插件主进程。
- 真实 Electron 环境下会调用 `window.ts.net.request()` 和 `window.ts.net.abort()`。
- Preview 模式下会自动回退到 SDK 提供的 mock `window.ts.net` 实现，适合基础联调。
- 如果请求逻辑包含敏感凭据、签名或更复杂的业务编排，仍建议放在插件主进程，再通过插件自己的 IPC 暴露给 UI。

## 宿主优先的开发流程

开发插件时，应把真实的 Translime 宿主作为主要运行环境。推荐顺序如下：

1. 在你自己的插件仓库中开发并重新构建插件。
2. 通过 `pnpm link` 将插件包链接到 Translime 的 `plugins_dev/node_modules` 目录。
3. 直接在 Translime 中打开插件，验证真实的宿主布局、设置、IPC 和窗口行为。

`preview:ui` 仍然可用，但只建议作为独立 UI 调试的辅助工具。对于依赖 Translime 上下文的页面，不应以 preview 结果替代宿主内验证。

## Preview 模式

Preview 模式允许你在普通浏览器中预览和调试插件 UI，无需依赖 Electron 环境。

### 特性

- 零配置：SDK 会自动检测 preview 模式并注入 mock 实现。
- 完整的 Vuetify 支持：Preview Shell 自动提供 Vuetify 组件和主题。
- mde-vue 支持：插件安装 mde-vue 后，Preview Shell 自动全局注册 mat-* 组件并提供 `window.mde$`（未安装时自动跳过）。
- API Mock：IPC、Dialog、Shell、插件设置等接口都有对应 mock。
- 声明式 IPC Mock：通过 `previewIpcMocks` 提供 mock handler 表，`invoke` 命中时返回 mock 结果而不是 `null`，UI 联调不再只靠日志。
- 设置持久化：插件设置使用 `localStorage` 存储。

### 快速开始

1. 在插件的 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "preview:ui": "vite -c ui.vite.config.mjs --mode preview"
  }
}
```

2. 运行：

```bash
pnpm preview:ui
```

3. 在浏览器中打开 Vite 输出的本地地址，通常是 `http://localhost:5173`。

### Vite 插件配置

```javascript
import { defineConfig } from 'vite';
import { translimeSdk } from 'translime-sdk/vite';

export default defineConfig(() => ({
  plugins: [
    translimeSdk({
      previewComponent: './src/ui/ui.vue',
      // 可选：声明式 IPC mock 模块（默认导出 handler 表）
      previewIpcMocks: './src/preview-mocks.mjs',
    }),
  ],
}));
```

`preview-mocks.mjs` 的键为事件名（可带或不带 `@插件ID` 后缀），值为 `(...args) => result`：

```javascript
export default {
  'get-data': async (query) => ({ ok: true, items: ['mock-1', 'mock-2'] }),
};
```

### Mock API 行为

| API | Mock 行为 |
|-----|----------|
| `useIpc().invoke()` | 命中 `previewIpcMocks` 表时返回其返回值（支持 Promise）；未命中打印调用日志并返回 `null` |
| `getPluginSetting()` | 从 `localStorage` 读取 |
| `setPluginSetting()` | 保存到 `localStorage` |
| `useClipboard()` | 使用浏览器 Clipboard API |
| `openLink()` | 使用 `window.open()` 打开新窗口 |
| `electronNetAdapter()` | 通过 mock `window.ts.net` 发起基础请求 |

### 条件代码

```javascript
import { isPreviewMode, useIpc } from 'translime-sdk';

if (isPreviewMode()) {
  console.log('当前运行在 Preview 模式');
} else {
  const ipc = useIpc();
  await ipc.invoke('some-api@plugin-id');
}
```
