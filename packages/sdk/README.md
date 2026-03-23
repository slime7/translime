# Translime SDK

Translime 官方插件 SDK，提供插件开发常用的运行时 API、类型提示和 Vite 集成能力。

## 安装

```bash
pnpm add translime-sdk
```

## Vite 集成

在插件的 `vite.config.js` 中使用 `translimeSdk()`，可以自动处理 `electron` 等依赖的外部化，并支持 preview 模式。

```javascript
import { defineConfig } from 'vite';
import { translimeSdk } from 'translime-sdk/vite';

export default defineConfig({
  plugins: [
    translimeSdk(),
  ],
});
```

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

- `useIpc()`: 获取 IPC 工具。
- `useVuetify()`: 获取 Vuetify 实例。
- `useVuetifyComponents()`: 获取所有 Vuetify 组件。
- `useVuetifyDirectives()`: 获取所有 Vuetify 指令。
- `useDialog()`: 获取 Electron 对话框 API。
- `useShell()`: 获取 Shell API。
- `getPluginSetting(...args)`: 获取插件设置。
- `setPluginSetting(...args)`: 设置插件设置。
- `useWindowControl()`: 获取窗口控制工具。
- `useClipboard()`: 获取剪贴板工具。
- `openLink(...args)`: 在浏览器中打开链接。
- `isPreviewMode()`: 检查当前是否为 preview 模式。
- `electronNetAdapter(config)`: 基于 `window.ts.net` 的 axios adapter。

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

## Preview 模式

Preview 模式允许你在普通浏览器中预览和调试插件 UI，无需依赖 Electron 环境。

### 特性

- 零配置：SDK 会自动检测 preview 模式并注入 mock 实现。
- 完整的 Vuetify 支持：Preview Shell 自动提供 Vuetify 组件和主题。
- API Mock：IPC、Dialog、Shell、插件设置等接口都有对应 mock。
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
    }),
  ],
}));
```

### Mock API 行为

| API | Mock 行为 |
|-----|----------|
| `useIpc().invoke()` | 打印调用日志，返回 `null` |
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
