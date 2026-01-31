# Translime 插件开发指南

本指南将介绍如何开发和调试 Translime 插件。

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
  "main": "./dist/index.cjs.js", // 插件后端逻辑入口
  "plugin": {
    "title": "插件标题",
    "description": "插件的功能描述",
    "icon": "src/icon.svg",      // 插件图标路径（相对于插件根目录）
    "ui": "dist/ui.esm.js",       // 插件前端 UI 入口（如果包含 UI）
    "windowUrl": "dist/index.html", // 独立窗口模式的 HTML 入口
    "windowUrl.dev": "http://localhost:3000" // (可选) 开发模式专用入口，此时将覆盖 windowUrl
  }
}
```

---

## 插件后端逻辑 (`index.js`)

插件的后端逻辑需通过 `export` 导出特定的配置和钩子。

### 1. 设置菜单 (`settingMenu`)

如果你希望在插件详情页提供配置项，可以导出 `settingMenu` 数组。

```javascript
/**
 * 字段说明：
 * @property {string} key - 存储在 config 中的键名
 * @property {string} name - 界面显示的标签名
 * @property {string} type - 控件类型：'input' | 'password' | 'switch' | 'checkbox' | 'radio' | 'list' | 'file'
 * @property {string} [placeholder] - 输入框提示信息
 * @property {boolean} [required] - 是否必填
 * @property {Array} [choices] - 当 type 为 'checkbox' | 'radio' | 'list' 时必填
 * @property {object} [dialogOptions] - 当 type 为 'file' 时，透传给 Electron dialog 的参数
 */
export const settingMenu = [
  // 文本框
  {
    key: 'input-key',
    type: 'input',
    name: '文本输入',
    placeholder: '请输入内容',
  },
  // 密码框
  {
    key: 'password-key',
    type: 'password',
    name: '密码',
  },
  // 开关
  {
    key: 'switch-key',
    type: 'switch',
    name: '启用功能',
  },
  // 复选框
  {
    key: 'checkbox-key',
    type: 'checkbox',
    name: '多项选择',
    choices: [
      { name: '选项1', value: 'opt1' },
      { name: '选项2', value: 'opt2' },
      { name: '选项3' }, // 如果没有 value，则取 name 的值
    ],
  },
  // 单选框 / 下拉列表
  {
    key: 'select-key',
    type: 'list', // 或 'radio'
    name: '单项选择',
    choices: ['A', 'B', 'C'], // 简写方式，直接传字符串数组
  },
  // 文件/目录选择
  {
    key: 'path-key',
    type: 'file',
    name: '路径选择',
    dialogOptions: {
      properties: ['openDirectory'],
    },
  },
];
```

### 2. 生命周期钩子

-   **`pluginDidLoad`**: 插件被启用或应用加载完成后执行。适合进行初始化操作（如检查路径、读取配置）。
-   **`pluginWillUnload`**: 插件被禁用或应用关闭前执行。适合进行清理工作（如销毁定时器）。
-   **`pluginSettingSaved`**: 插件设置在 UI 界面保存后触发。

```javascript
export const pluginDidLoad = async () => {
  // 获取插件私有配置示例 (plugin.<plugin-id>.settings.<key>)
  const { mainStore } = global;
  const config = mainStore?.config;
  const mySetting = config.get('plugin.your-plugin-name.settings.path-key');
};

export const pluginSettingSaved = () => {
  console.log('设置已更新');
};

export const pluginWillUnload = () => {
  // 清理逻辑
};
```

### 3. IPC 通信 (`ipcHandlers`)

插件可以通过 `ipcHandlers` 定义与前端 UI 交互的接口。Translime 采用 `invoke` 模式。

```javascript
export const ipcHandlers = [
  {
    type: 'test-ipc', // UI 端通过 ipc.invoke('test-ipc@plugin-id', ...args) 调用
    /**
     * @param {object} context 包含工具函数，如 sendToClient
     * @returns {Function} 返回一个函数处理请求
     */
    handler: ({ sendToClient }) => async (arg1, arg2) => {
      try {
        console.log('接收到参数:', arg1, arg2);
        // 主动推送给 UI (可选)
        // sendToClient('event-name', data);
        return { success: true, message: '响应结果' };
      } catch (e) {
        return { success: false, message: e.message };
      }
    },
  }
];
```

### 4. 额外菜单 (`pluginMenu`)

你可以在 Translime 的某些位置（依赖具体实现）添加自定义菜单（附加在插件下拉菜单）。

```javascript
// 符合 Electron MenuItem 配置
export const pluginMenu = [
  {
    id: `plugin-custom-menu`,
    label: '自定义菜单项',
    click() {
      console.log('点击了菜单');
    },
  },
];
```

### 5. 导出配置

最后，需要将上述成员导出：

```javascript
export default {
  pluginDidLoad,
  pluginWillUnload,
  pluginSettingSaved,
  settingMenu,
  pluginMenu,
  ipcHandlers,
};
```

---

## 使用 Translime SDK (推荐)

`translime-sdk` 是官方提供的开发工具包，它提供了完善的类型提示并简化了对主进程与渲染进程 API 的访问。

### 安装

```bash
pnpm add translime-sdk
```

### 使用 Vite 插件

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

### 代码示例

#### 主进程逻辑 (src/index.js)

```javascript
import { usePluginConfig } from 'translime-sdk';

const config = usePluginConfig('my-plugin-id');
const myValue = config.get('settingsKey', 'default');
```

#### 渲染进程 UI (src/ui/ui.vue)

```javascript
import { useIpc, useVuetifyComponents } from 'translime-sdk';

const ipc = useIpc();
const { VBtn, VCard } = useVuetifyComponents();
```

### 核心 API

更多 API 详细说明请参阅 [Translime SDK 文档](../sdk/README.md)。

---

## UI 端开发 (Frontend UI)

如果你的插件包含 UI（通过 `ui` 或 `windowUrl` 定义），推荐使用 `translime-sdk` 提供的 Hooks 与主进程或系统进行交互。虽然 Translime 在全局对象中注入了 `window.ts` 和 `window.electron`，但使用 SDK 可以获得更好的开发体验和完善的类型支持。

### 使用 SDK 开发

在 Vue 组件中，你可以通过 `translime-sdk` 轻松访问各种功能。

#### 1. IPC 通信
使用 `useIpc()` 来与主进程定义的 `ipcHandlers` 进行交互。这是插件前后端通信的核心。

```javascript
import { useIpc } from 'translime-sdk';

const ipc = useIpc();

// 调用主进程定义的接口，格式为 'handlerName@pluginId'
// 注意：必须带上 @pluginId 后缀，以便系统准确路由到对应插件
const result = await ipc.invoke('test-ipc@my-plugin-id', arg1, arg2);
```

#### 2. 插件设置管理
使用 SDK 函数即可读写当前插件的配置。

```javascript
import { getPluginSetting, setPluginSetting } from 'translime-sdk';

// 获取插件设置
const settings = await getPluginSetting('my-plugin-id');

// 更新插件设置
await setPluginSetting('my-plugin-id', { someKey: 'newValue' });
```

#### 3. 系统原生能力
SDK 封装了常用的系统操作：

- **窗口控制**：`useWindowControl()` 提供 `close()`, `maximize()`, `minimize()`, `devtools()` 等。
- **对话框**：`useDialog()` 提供 `showOpenDialog()` 等 Electron 原生对话框。
- **剪贴板**：`useClipboard()` 提供 `readText()`, `writeText(text)`。
- **外部链接**：`openLink(url)` 在用户默认浏览器中打开 URL。

---

### 底层 API (可选)

在少数 SDK 未涵盖的情况下，你仍可以访问 Translime 注入的原始接口：

- **`window.ts`**: 提供业务相关的底层接口，如 `ts.net.request` (绕过跨域的网络请求) 和 `ts.logger` (系统日志打印)。
- **`window.electron`**: 提供 Electron 底层属性，如 `electron.versions` 和 `electron.APPDATA_PATH`。

有关 API 的完整列表和详细参数，请参阅 [Translime SDK 文档](../sdk/README.md)。
