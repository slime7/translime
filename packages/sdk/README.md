# Translime SDK

这是 Translime 插件开发的官方 SDK。它提供了完善的类型提示 (.d.ts) 并简化了对主程序 API 的访问。

## 安装

```bash
pnpm add translime-sdk
```

## 使用 Vite 插件

在插件的 `vite.config.js` 中使用内置插件，可以自动处理 `electron` 等依赖的外部化：

```javascript
import { defineConfig } from 'vite';
import { translimeSdk } from 'translime-sdk/vite';

export default defineConfig({
  plugins: [
    translimeSdk(),
    // ... 其他插件
  ]
});
```

## 代码示例

### 主进程逻辑 (src/index.js)

```javascript
import { usePluginConfig } from 'translime-sdk';

const config = usePluginConfig('my-plugin-id');
const myValue = config.get('settingsKey', 'default');
```

### 渲染进程 UI (src/ui/ui.vue)

```javascript
import { useIpc, useVuetifyComponents } from 'translime-sdk';

const ipc = useIpc();
const { VBtn, VCard } = useVuetifyComponents();
```

## 核心 API

### 主进程 (Main Process)

- `getMainStore()`: 获取主程序的全局 Store。
- `usePluginConfig(pluginId)`: 获取针对特定插件的配置工具。
- `usePluginInterop()`: 获取插件间通信工具 (`PluginInterop` 实例)，用于在主进程中访问其他插件暴露的 API 和事件。

#### 插件间通信 (usePluginInterop)

使用 `usePluginInterop()` 可以在一个插件的主进程代码中调用另一个插件导出的 `libs` 对象。跨插件通信只在主进程有效。

> [!IMPORTANT]  
> 由于插件加载顺序和启用状态不确定，**强烈不建议**缓存 `interop.getExports()` 的返回值。推荐在需要调用时**实时获取**，或使用事件监听机制。如果必须等待另一个插件加载，请使用 `waitForPlugin()`。

**获取 API 示例**

```javascript
import { usePluginInterop } from 'translime-sdk';

const doSomething = async () => {
  const interop = usePluginInterop();
  if (!interop) return;

  // 方式一：懒获取（推荐，始终拿最新引用）
  const targetApi = interop.getExports('target-plugin-id');
  if (targetApi) {
    targetApi.someMethod();
  }

  // 方式二：等待目标插件激活
  try {
    const api = await interop.waitForPlugin('target-plugin-id', 5000 /* 5秒超时 */);
    api.someMethod();
  } catch (err) {
    console.error('目标插件未就绪');
  }

  // 方式三：监听目标插件生命周期
  interop.on('activated', (pluginId, exports) => {
    if (pluginId === 'target-plugin-id') {
      exports.onEvent((data) => console.log('收到事件:', data));
    }
  });
};
```

### 渲染进程 (Renderer Process)

- `useIpc()`: 获取 IPC 工具。
- `useVuetifyComponents()`: 获取所有 Vuetify 组件。
- `useVuetifyDirectives()`: 获取所有 Vuetify 指令。
- `useDialog()`: 获取 Electron 对话框 API。
- `useShell()`: 获取 Shell API。
- `getPluginSetting(...args)`: 获取插件设置。
- `setPluginSetting(...args)`: 设置插件设置。
- `useWindowControl()`: 获取窗口控制工具。
- `useClipboard()`: 获取剪贴板工具。
- `openLink(...args)`: 在浏览器中打开链接。
- `isPreviewMode()`: 检查当前是否为 Preview 模式。

### 通用 (Common)

- `useLogger()`: 获取标准日志工具，支持 `log`, `info`, `warn`, `error`, `debug`。在渲染进程中会自动通过 IPC 发送到主进程记录，在主进程中则直接写入日志文件。

---

## Preview 模式

Preview 模式允许你在普通浏览器中预览和调试插件 UI，无需依赖 Electron 环境。这使得开发过程中能够享受 Vite 的 HMR (热模块替换) 便利性。

### 特性

- ✅ **零配置**：插件代码无需任何修改，SDK 会自动检测 preview 模式并注入 mock 实现
- ✅ **完整的 Vuetify 支持**：Preview Shell 自动提供 Vuetify 组件和主题
- ✅ **API Mock**：所有 Electron 相关的 API (IPC, Dialog, Shell 等) 都有对应的 mock 实现
- ✅ **设置持久化**：插件设置使用 localStorage 存储，刷新页面后仍然保留
- ✅ **主题切换**：Preview 界面提供浅色/深色主题切换

### 快速开始

1. **在插件的 `package.json` 中添加 preview 脚本**：

```json
{
  "scripts": {
    "preview:ui": "vite -c ui.vite.config.mjs --mode preview"
  }
}
```

2. **运行 preview 模式**：

```bash
pnpm preview:ui
```

3. **访问预览页面**：在浏览器中打开 Vite 提供的地址 (通常是 `http://localhost:5173`)

### Vite 插件配置

`translimeSdk()` 插件会自动处理 preview 模式的配置。你可以通过 `previewComponent` 选项指定要预览的组件路径：

```javascript
import { defineConfig } from 'vite';
import { translimeSdk } from 'translime-sdk/vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    translimeSdk({
      // 可选：指定要预览的组件路径，默认使用 lib.entry
      previewComponent: './src/ui/ui.vue'
    }),
  ],
  // ... 其他配置
}));
```

### Mock API 行为

在 Preview 模式下，SDK 提供的 API 会有以下行为：

| API | Mock 行为 |
|-----|----------|
| `useIpc().invoke()` | 打印调用日志，返回 `null` |
| `useDialog().showOpenDialog()` | 使用浏览器原生文件选择器 |
| `getPluginSetting()` | 从 localStorage 读取 |
| `setPluginSetting()` | 保存到 localStorage |
| `useClipboard()` | 使用浏览器 Clipboard API |
| `openLink()` | 使用 `window.open()` 打开新窗口 |

### 条件代码

如果需要在 preview 模式下执行不同的逻辑，可以使用 `isPreviewMode()` 函数：

```javascript
import { isPreviewMode, useIpc } from 'translime-sdk';

if (isPreviewMode()) {
  console.log('当前运行在 Preview 模式');
  // 执行替代逻辑
} else {
  const ipc = useIpc();
  await ipc.invoke('some-api@plugin-id');
}
```

