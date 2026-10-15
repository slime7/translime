# translime-plugin-scrcpy-wrapper

基于 scrcpy-server 协议直连的安卓投屏画面窗口插件。画面以 WebCodecs 硬解渲染在
Electron 窗口的 `<canvas>` 中，点击/滚轮/键盘/剪贴板经 scrcpy 控制通道注入设备，
整个投屏过程只有一个原生窗口。

## 功能

- **镜像整屏**：镜像设备默认显示器，画面按设备分辨率等比缩放（letterbox）。
- **虚拟屏投屏**：以指定分辨率创建虚拟屏（`new_display`），开启 flex-display 后
  分辨率连续跟随窗口拉伸（`RESIZE_DISPLAY` 控制消息），内容随拉伸重排、无黑边。
- **按应用投屏**：启动时经 `START_APP` 控制消息拉起指定应用到前台（镜像默认屏或虚拟屏内）。
- **输入复刻**：鼠标（pointerId=-1，右键=返回、中键=主页由 UI 承担）、多点触控
  （基础 action + pointerId，设备端合成 POINTER 事件）、滚轮（i16 定点 ±16）、
  键盘（`event.code` → Android keycode 映射表，无映射的可打印字符与 IME 组合串走文本注入）。
- **音频转发**：Opus 48kHz 立体声裸包 → `AudioDecoder` → `AudioContext` 按播放时钟调度，
  积压丢帧、落后重对齐；AudioContext 受自动播放策略限制时，窗口内首次点击后恢复。
- **剪贴板同步**：设备复制自动回传电脑（控制通道回包）；`Ctrl+V` 将电脑剪贴板写入
  设备并触发粘贴。
- **无线投屏**：支持无线调试配对（`adb pair`）、mDNS/端口扫描兜底连接与已存设备自动重连。

## 架构与数据流

```
设备 scrcpy-server (app_process)
   │ adb reverse localabstract:scrcpy_<scid> → 127.0.0.1:<port>
   ▼
插件主进程（net server，按序 accept：video → audio → control）
   │ video: [64B 设备名][4B codec id][12B 会话头][12B 帧头+Annex B 裸流]
   │ audio: [4B codec id][12B 帧头+Opus 裸包]
   │ control: 结构化输入消息编码为二进制写回
   ▼  webContents.send('scrcpy-media@<插件ID>')
画面窗口（wrapper 页面）
   canvas  ← WebCodecs VideoDecoder（RAF 画最新帧，积压丢弃非关键帧）
   AudioContext ← WebCodecs AudioDecoder
   DOM 指针/滚轮/键盘事件 → ipc-fn 通道 → 控制消息
```

协议实现对照 scrcpy **v5.0.1** 源码（`src/server/` 下各模块注释标注了对应字段布局）：

- `src/server/server-args.js`：server 启动命令（`app_process / com.genymobile.scrcpy.Server
  5.0.1 key=value...`，`scid` 十六进制、socket 名 `scrcpy_%08x`）。
- `src/server/video-frame-parser.js`：媒体流解析（设备名/codec id/会话头/帧头，
  H.264/H.265 的 SPS/PPS config 包前置合并到下一个关键帧）。
- `src/server/control-message.js`：控制消息编码（触摸/滚轮/按键/文本/剪贴板/
  `RESET_VIDEO`/`RESIZE_DISPLAY` 等）与控制通道回包解析（剪贴板自动同步）。

## 依赖与占用

- 运行依赖 **adb**：解析顺序为插件设置 > 旧版 scrcpy 设置项同目录的 adb > 系统 PATH。
  scrcpy.exe 本体不再需要。
- 插件捆绑 `bin/scrcpy-server`（来自 [scrcpy v5.0.1 release](https://github.com/Genymobile/scrcpy/releases/tag/v5.0.1)，
  SHA256 `764eb6f79811d5211fe9df341120882ba9994c7a61b897d7bf3fb662e53bc536`）。
  scrcpy 为 Apache-2.0 许可，版权归 Genymobile 及贡献者，可在设置中用自备 server 覆盖。
- 推流期间的数据路径跑在 adb server 的隧道上（reverse 转发），无法在推流时完全脱离
  adb；但 adb server 支持多客户端并存，本插件不独占设备。每会话常驻物仅：
  1 条 reverse 规则 + 1 个 `adb shell` 生命周期锚点进程 + 设备侧 server 进程。
  关闭窗口、server 断开、插件卸载、宿主退出（`will-quit` 兜底）时均会关闭 socket
  （设备侧 EOF 自退）、kill 锚点进程树并移除 reverse 规则。

## 设置

| 设置项 | 说明 |
| --- | --- |
| adb 路径 | 留空按上节顺序自动解析 |
| scrcpy 路径 | 旧版兼容项，仅用于同目录定位 adb |
| scrcpy-server 路径 | 可选，覆盖内置 server（升级 server 版本时使用） |
| 视频编码 | `h264`（默认，兼容性最好）或 `h265`（需设备与显卡支持 HEVC 解码） |

## 代码结构与测试

```
index.js                    插件入口：设置菜单、IPC（list-devices/pair-wireless/launch/close-session/scrcpy-input）
src/scrcpy.js               会话编排：reverse → push → 启动 server → 连接等待 → 媒体泵 → IPC 转发 → 清理
src/server/server-args.js   server 启动参数构建
src/server/video-frame-parser.js  媒体流帧解析（视频/音频通用）
src/server/control-message.js     控制消息编码 + 回包解析
src/adb.js                  adb 命令封装（devices/wm size/push/reverse/pair/connect/mdns）
src/wireless.js             无线调试配对与重连
src/ui/wrapper/             画面窗口页面（canvas/解码/输入/音频）与 preload 桥
tests/                      vitest 单测：协议字节级回归、分片重组、keycode 映射、坐标换算等
```

命令：`pnpm build`（三段构建）、`pnpm test`、`pnpm lint`、`pnpm dev`（并行 watch）。

真机手工验证清单（协议实现无 e2e，依赖真机行为）：

1. USB 与无线两种连接下分别验证镜像/虚拟屏/按应用投屏。
2. 有声（音乐 App）验证音频转发；窗口点击、拖动、滚轮、键盘输入（含中文 IME）。
3. 设备旋转后画面比例随会话头更新；`Ctrl+C`/`Ctrl+V` 双向剪贴板。
4. 推流中关闭窗口、推流中退出宿主：`adb shell ps | grep scrcpy` 应无残留进程，
   `adb reverse --list` 应无残留规则。

---

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
  // 引用 SDK 的 manifest JSON schema，编辑器可获得字段补全与校验
  "$schema": "https://slime7.github.io/translime/translime-plugin.schema.json",
  "name": "your-plugin-name",
  "version": "1.0.0",
  "type": "module", // 主进程入口为 ESM 产物
  "main": "./dist/index.esm.js", // 插件后端逻辑入口（保持单文件 bundle）
  "engines": {
    "translime": ">=0.7.0" // 要求的宿主版本（semver 范围）；未声明时默认兼容任意版本。UI 使用 mde-vue 时需 >=0.7.0
  },
  "plugin": {
    "title": "插件标题",
    "description": "插件的功能描述",
    "icon": "src/icon.svg",      // 插件图标路径（相对于插件根目录）
    "ui": "dist/ui.esm.js",       // 插件前端 UI 入口（如果包含 UI）
    "activationEvents": ["onView"], // 激活时机，未声明时默认为 onStartup
    "dependencies": ["translime-plugin-foo"], // 硬依赖
    "optionalDependencies": ["translime-plugin-bar"], // 可选依赖
    "isolated": false,           // (可选) true 时主进程代码运行在独立 utilityProcess 中
    "contributes": {
      "commands": [
        {
          "id": "translime-plugin-scrcpy-wrapper.run",
          "title": "运行示例命令"
        }
      ]
    },
    "windowUrl": "dist/index.html", // 独立窗口模式的 HTML 入口
    "windowUrl.dev": "http://localhost:3000" // (可选) 开发模式专用入口，此时将覆盖 windowUrl
  }
}
```

### 激活时机说明

当前宿主支持以下激活事件：

- `onStartup`: 启动时激活。旧插件未声明时默认使用这个模式。
- `onAppReady`: 主窗口稳定后异步激活，适合不必阻塞首屏的后台逻辑。
- `onView`: 打开插件页面或插件窗口前激活。
- `onCommand:<id>`: 执行某个静态声明的命令前激活。
- `onIpc:<type>`: 第一次收到某个插件 IPC 调用前激活。

建议：

- 带 UI 的普通工具型插件优先使用 `onView`。
- 真正需要驻留后台的插件再使用 `onStartup` 或 `onAppReady`。
- 不要把昂贵初始化默认放在 `onStartup`。

### 依赖说明

- `dependencies` 是硬依赖，用于声明前置插件。
- `optionalDependencies` 是可选依赖，只表示“有则使用”。
- `pluginInterop` 仍然可用，但它负责的是已激活插件之间的通信，不替代 manifest 依赖声明。

### 宿主版本兼容（engines.translime）

- 在 `package.json` 的 `engines` 中声明 `translime` 字段（semver 范围），例如 `">=0.7.0"`。
- 宿主加载插件时会校验该范围；不满足时插件标记为 `incompatible` 并保持停用，不会执行入口代码。
- 未声明（或声明为 `*`）视为兼容任意宿主版本，旧插件无需改动即可继续运行。

### 隔离模式（plugin.isolated）

可选声明 `"isolated": true`，让插件主进程代码运行在独立的 utilityProcess 中：

- 优势：插件崩溃或无界循环不会拖垮宿主与其他插件，适合易崩、重计算或加载不可靠原生模块的插件。
- 限制：隔离模式下不支持 `libs` 导出与 `getMainStore` / `usePluginConfig` / `usePluginInterop`
  （SDK 会抛出明确错误），跨插件协作请改用 IPC handler。
- IPC handler、`commands`、`pluginDidLoad` / `pluginWillUnload` / `pluginSettingSaved`
  与常规模式用法一致，由宿主自动桥接；`sendToClient` 仅支持主窗口与 `'all'` 两种目标。

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
 * @property {'array'|'string'} [valueType] - 当 type 为 'file' 时，保存选择结果的格式；默认 'array'，设为 'string' 时保存第一个路径
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
    valueType: 'string',
    dialogOptions: {
      properties: ['openDirectory'],
    },
  },
];
```

### 2. 生命周期钩子

-   **`pluginDidLoad`**: 插件真正被激活时执行。适合进行初始化操作（如检查路径、读取配置）。
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

建议把重逻辑放到真正需要的激活时机上，不要默认假设宿主一定会在启动后立刻执行 `pluginDidLoad`。

### 3. IPC 通信 (`ipcHandlers`)

插件可以通过 `ipcHandlers` 定义与前端 UI 交互的接口。Translime 采用 `invoke` 模式。
推荐使用 SDK 的 `defineIpcHandlers`：`type` 不需要带 `@插件ID` 后缀（宿主注册通道时自动追加），
缺 `type` / 缺 `handler` / 误带 `@` 的条目会在插件激活前直接抛错。

```javascript
import { defineIpcHandlers } from 'translime-sdk';

export const ipcHandlers = defineIpcHandlers([
  {
    type: 'test-ipc', // UI 端通过 useIpc('插件ID').invoke('test-ipc', ...args) 调用
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
  },
]);
```

如果在 manifest 中声明了 `onIpc:test-ipc`，那么第一次调用 `test-ipc@plugin-id` 前，宿主会先激活你的插件，再把请求路由到对应 handler。

### 4. 额外菜单 (`pluginMenu`)

你可以在 Translime 的某些位置（依赖具体实现）添加自定义菜单（附加在插件下拉菜单）。

宿主菜单由渲染端 Material 3 菜单组件渲染，只支持 Electron `MenuItem` 配置的子集：
`id`、`label`、`click`、`type`（`'separator'` 或 `'checkbox'`）、`checked`、`enabled` 与
`visible`。子菜单、图标等其余能力暂不支持。

```javascript
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

### 5. 插件命令 (`commands`)

如果你在 `plugin.contributes.commands` 中静态声明了命令，可以在主进程导出对应的运行时命令处理函数：

```javascript
export const commands = [
  {
    id: 'translime-plugin-scrcpy-wrapper.run',
    handler(...args) {
      return { ok: true, args };
    },
  },
];
```

UI 或其他调用方可通过宿主命令入口触发，宿主会先激活插件再执行命令。

### 6. 导出配置

最后，需要将上述成员导出：

```javascript
export default {
  pluginDidLoad,
  pluginWillUnload,
  pluginSettingSaved,
  settingMenu,
  pluginMenu,
  ipcHandlers,
  commands,
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

在插件的 `vite.config.mjs` 中使用内置插件，可以自动处理 `electron` 等依赖的外部化：

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

#### 渲染进程命令调用

```javascript
import { executePluginCommand } from 'translime-sdk';

await executePluginCommand('translime-plugin-scrcpy-wrapper.run', {
  from: 'ui',
});
```

#### 渲染进程 UI (src/ui/ui.vue)

```javascript
import { useIpc, useMatComponents } from 'translime-sdk';

const ipc = useIpc();
const { MatBtn, MatCard } = useMatComponents();
// 模板中也可以直接写 mat-* 标签（如 <mat-btn />），SDK 编译期自动注入组件
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

// 推荐：传入插件 ID，事件名自动补全 `@插件ID` 后缀，无需手拼字符串
const ipc = useIpc('my-plugin-id');
const result = await ipc.invoke('test-ipc', arg1, arg2);

// 接收主进程 sendToClient('event-name') 的主动推送（同样自动补全后缀）
ipc.on('event-name', (data) => { ... });

// 也可以不传插件 ID 使用原始客户端，此时事件名必须自带 'handlerName@pluginId' 后缀
const rawIpc = useIpc();
const sameResult = await rawIpc.invoke('test-ipc@my-plugin-id', arg1, arg2);
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

## Sass 移除后的 UI 样式规则

模板和宿主已经移除 Sass 编译依赖。插件 UI 样式请遵循以下规则：

- 使用 `<style>` 或 `<style scoped>`，不要使用 `lang="scss"`、`lang="sass"`。
- 不要使用 Sass 变量、`@use`、`@forward`、mixin 或嵌套语法；嵌套选择器必须改写为扁平 CSS，例如 `.plugin-main .red {}`。
- UI 构建保留 `rolldownOptions.external: ['vue']`，并使用 `translimeSdk()` 与 `createPluginCssIsolationPlugins(pluginId)`。
- 使用 Tailwind 时，将样式放入插件专用 `@layer`，不要直接引入未分层的 `tailwindcss`。

## UI 样式隔离

`createPluginCssIsolationPlugins(pluginId)` 负责 CSS 提取、运行时注入、样式 ID 去重和插件专用 `@layer`。构建阶段保留原始选择器，由宿主 app 在内嵌插件 UI 的运行时包裹为：

```css
@layer translime-plugin {
  @scope (.plugin-ui-loader[data-plugin-id="插件ID"]) {
    /* 插件原始 CSS */
  }
}
```

宿主会将插件样式中的 `:root`、`:host`、`html`、`body` 根级规则映射到作用域内的 `:scope`，以便主题变量继续生效。`@scope` 负责限制选择器匹配范围；继承属性以及 `@keyframes`、`@font-face`、`@property` 等全局命名空间仍遵循浏览器原生语义，相关名称应保持插件内唯一。
