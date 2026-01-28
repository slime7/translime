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
