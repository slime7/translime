# Translime Plugin: HDR Capture (`translime-plugin-hdr-capture`)

## 项目概述 (Project Overview)

本插件是一个用于 **Translime** 的 HDR 截图工具，支持通过快捷键或界面触发 HDR 截图功能。项目结合了 Electron 主进程逻辑、Vue 3 渲染进程 UI 以及 Rust Native 模块以实现高性能的截图处理。

- **插件名称**: `translime-plugin-hdr-capture`
- **功能描述**: 轻松获取 HDR 截图。
- **技术栈**: 
    - **Frontend**: Vue 3, Vuetify 3, Vite
    - **Backend**: Electron (Node.js)
    - **Native**: Rust (NAPI-RS)

## 目录结构说明 (Directory Structure)

```
translime-plugin-hdr-capture/

├── native/                 # Rust Native 模块源码 (Native source)
│   ├── src/                # Rust 源代码 (lib.rs, capture.rs, etc.)
│   └── Cargo.toml          # Rust 项目配置
├── src/                    # JavaScript/Vue 源码 (Source code)
│   ├── assets/             # 静态资源 (图片, 图标)
│   ├── capture/            # 截图核心逻辑 (Capture logic)
│   │   └── index.js        # 截图功能入口
│   ├── ui/                 # UI 相关代码 (UI components)
│   │   ├── overlay/        # 覆盖层窗口 UI
│   │   ├── overlay-preload.js # 覆盖层预加载脚本
│   │   └── ui.vue          # 插件主设置界面 (Settings UI)
│   └── main.js             # 主进程入口文件 (Main process entry)
├── package.json            # 项目配置与依赖 (Project config)
├── vite.config.js          # 通用 Vite 配置
├── ui.vite.config.mjs      # UI 构建 Vite 配置
└── overlay.vite.config.mjs # Overlay 构建 Vite 配置
```

## 开发规范 (Development Guidelines)

### 环境隔离 (Environment Isolation)

严格区分 **主进程** 和 **渲染进程** 的代码逻辑与 API 使用：

*   **主进程 (Main Process)**
    *   **入口文件**: `src/main.js` / `src/capture/index.js`
    *   **可用 API**: `getMainStore()`, `usePluginConfig(pluginId)`
    *   **禁用 API**: `useIpc()`, `useWindowControl()`, `useDialog()` 等 UI Hook

*   **渲染进程 (Renderer Process)**
    *   **入口文件**: `src/ui/ui.vue`, `src/ui/overlay/App.vue`
    *   **可用 API**: `useIpc()`, `useVuetifyComponents()`, `getPluginSetting()`, `setPluginSetting()`, `useWindowControl()`
    *   **禁用 API**: `getMainStore()` 等直接访问 Node 层的函数

### IPC 通信 (IPC Communication)

*   **调用格式**: `ipc.invoke('event-name@translime-plugin-hdr-capture')`
*   **命名规范**: 事件名必须包含插件 ID 后缀 (`@translime-plugin-hdr-capture`) 以避免冲突。
*   **处理逻辑**: 在 `src/main.js` 中通过 `ipcHandlers` 定义。

### 跨插件通信 (Libs Export)

本插件通过 `libs` 导出截图完成事件，其他插件可通过 `pluginInterop` 订阅。

*   **事件**: `capture-complete`
*   **回调参数**: `{ path: string|null, hdrPath: string|null, type: 'save'|'copy' }`
    *   `path`: 保存时为文件完整路径，复制到剪贴板时为 `null`。
    *   `hdrPath`: HDR 原始文件路径（EXR 或 fallback），未开启或保存失败时为 `null`。
    *   `type`: `'save'` 表示保存到文件，`'copy'` 表示复制到剪贴板。

**其他插件使用示例**:

```javascript
import { usePluginInterop } from 'translime-sdk';

const interop = usePluginInterop();
const hdrApi = interop.getExports('translime-plugin-hdr-capture');
if (hdrApi) {
  hdrApi.onCaptureComplete(({ path, hdrPath, type }) => {
    console.log(`截图完成: type=${type}, path=${path}, hdrPath=${hdrPath}`);
  });
}
```

**API**:
*   `onCaptureComplete(fn)`: 注册截图完成事件监听。
*   `offCaptureComplete(fn)`: 移除截图完成事件监听。

### UI 开发 (UI Development)

*   **设置界面 (`src/ui/ui.vue`)**:
    *   **框架**: Vue 3 + Vuetify 3。
    *   **图标**: 使用 Material Design Icons (md) 风格 (例如 `<v-icon>home</v-icon>`)。
    *   **样式注入**: 使用 `vite-plugin-css-injected-by-js`，配置 `styleId: 'translime-plugin-hdr-capture'`。

*   **全屏覆盖层 (`src/ui/overlay/`)**:
    *   **入口**: 独立的多页应用入口 (`src/ui/overlay/window/overlay.html`)。
    *   **框架**: Vue 3 + TailwindCSS (无 Vuetify)。
    *   **通信桥梁**: `src/ui/overlay-preload.js` 向渲染进程注入 `window.hdrCapture` API (如 `onInit`, `saveCapture`)。
    *   **组件**: `FrozenScreens` (背景冻结), `SelectionRect` (选区交互), `HintBox` (智能防遮挡提示), `ActionToolbar` (操作工具栏与动态提示).

*   **通用样式**:
    *   推荐使用 **TailwindCSS** 进行布局。
    *   避免全局样式污染，尽量使用 Scoped CSS。

### Native 模块 (Native Module)

*   **技术栈**: Rust + NAPI-RS。
*   **源码**: `native/src/lib.rs` (导出定义), `native/src/capture.rs` (Windows.Graphics.Capture), `native/src/image_proc.rs` (图像处理)。
*   **核心 API**:
    *   `capture_display`: 捕获屏幕 (支持 HDR)。
    *   `get_top_level_windows` / `get_window_at_point`: 窗口探测。
    *   `crop_image` / `resize_image`: 图像裁剪与缩放。
    *   `tone_map`: HDR 到 SDR 色调映射。
    *   `encode_image`: 编码为 PNG/JPG/WebP。
    *   `crop_hdr_f16` / `encode_hdr_to_exr`: 原始 HDR 数据处理 (F16 -> EXR)。
*   **构建**: `pnpm build:native` => `native.node`。

### 核心流程 (Core Workflow)

*   **截图全流程**:
    -   **触发**: 用户快捷键/按钮 -> 主进程 `start-capture`。
    -   **捕获**: 调用 `native.capture_display` 并行获取所有屏幕图像。
    -   **预览**: 打开全屏 Overlay (`src/ui/window/overlay.html`)，传入预览图像。
    -   **交互**: 用户在 Overlay 上进行选区、标注、移动或窗口自动探测。
    -   **确认**: 用户点击 Save/Copy -> 发送 `saveCapture` / `copyCapture` 到主进程。
    -   **后处理**: `src/capture/index.js` 执行核心处理：
        *   `cropAndSaveScaledFromBuffer`: 计算多屏选区重叠，物理裁剪、缩放对齐、拼接。
        *   **HDR**: 若开启，同时处理 SDR ToneMapping 版本与原始 HDR (EXR) 版本。

### 构建与调试 (Build & Debug)

*   **Preview UI**: `pnpm run preview:ui` (预览设置界面)
*   **Preview Overlay**: `pnpm run preview:overlay` (预览覆盖层界面)
*   **Build Full**: `pnpm build` (清理 dist, 构建 main, ui, overlay, native)
*   **Build Structure**:
    *   `plugin`: Plugin entry (`vite build`)
    *   `ui`: Settings UI (`vite -c ui.vite.config.mjs`)
    *   `overlay`: Overlay UI (`vite -c overlay.vite.config.mjs`) - 支持 `mode=preload` (构建 preload.js) 和默认模式 (构建 HTML)。
    *   `native`: Rust binary (`napi build`)

## 特别注意事项 (Special Notes)

*   **文档同步**: 每次完成新功能或修改核心逻辑后，**必须同步更新本文件 (`memo.md`)**，以保持项目的一致性与可维护性。
*   **Vite 配置**: 不同的入口文件使用了不同的 Vite 配置文件 (`ui.vite.config.mjs`, `overlay.vite.config.mjs`)，请确保修改对应配置。
*   **图标路径**: 插件图标必须在 `package.json` 中准确指定 (`plugin.icon`)。
*   **Vue External**: Vue 必须在构建时被标记为 external，避免重复打包。

## 2026-03 捕获界面元素功能补充

### 交互模式

Overlay 现在支持两种自动探测模式：

*   **窗口模式**：沿用原有顶层窗口候选逻辑。
*   **界面元素模式**：基于 Windows UI Automation API 探测鼠标位置下的界面元素层级链。

两种模式通过 **Tab** 键切换，滚轮在两种模式下都可用于切换当前点位的不同层级候选。

### 性能策略

为了避免影响截图编辑窗口响应速度，界面元素检测采用了以下策略：

*   **按需调用**：仅在界面元素模式下触发 UI Automation 探测。
*   **前端节流**：鼠标移动不会直接同步调用原生接口，而是通过短延迟节流与“只保留最后一次点位”的方式合并请求。
*   **单飞并发控制**：同一时间只允许一个元素检测请求在进行，旧结果不会覆盖新鼠标位置的状态。
*   **轻量层级链查找**：原生侧先定位底层目标窗口，再在该窗口的 UI Automation 控件树内沿包含当前点位的最小子节点路径向下查找，只返回从内到外的候选链，而不是扫描整棵桌面树。
*   **小元素候选复用**：前端会在鼠标仍停留于当前最小候选元素内部时，直接复用上一轮候选链，不继续发起 native 请求。这个规则直接影响悬停延迟，后续修改不要轻易移除。
*   **大候选 / 整窗复用**：如果当前只有一个候选，或者当前最内层候选面积很大，则在鼠标仅小范围移动时也会复用上一轮结果，而不是每移动 1px 都重新查询。没有这条限制时，WinForms 这类只能识别到整窗的程序会产生非常密集的 IPC 和 UIA 请求，明显拖慢甚至卡住主进程。
*   **同窗口网格缓存**：前端会基于“窗口句柄 + 外层窗口矩形 + 点位网格”缓存最近一次元素候选链。同一窗口内命中同一网格时，直接复用上一轮候选，不再进入主进程。这一层缓存主要用于压低可识别元素窗口中的悬停延迟。
*   **多 walker 回退**：原生侧不能只依赖 `ElementFromPoint + RawViewWalker`。当前实现会依次尝试 `RawViewWalker` 父链、`ContentViewWalker` 向下命中链、`ControlViewWalker` 向下命中链，并选择层级更深、最内层矩形更小的结果。
*   **外层窗口边缘清理**：对于 Electron / Chromium 一类窗口，UIA 最外层 `Window` 候选常常只比内层内容区域大 8px 左右。当前实现会在存在更内层同窗口候选时，剔除这种仅用于阴影或外框的 `Window` 候选，避免滚轮切换时选中窗口外缘。
*   **重复矩形折叠**：原生侧会在返回“从内到外”的界面元素候选链前，合并相邻且矩形边界完全一致的候选，避免滚轮在视觉上完全相同的父子级选区之间来回切换。

### 性能边界

界面元素探测运行在截图 Overlay 的主链路上，因此要优先保证“不会卡住截图工具本身”：

*   **深层 walker 不能全量启用**：`ContentViewWalker` / `ControlViewWalker` 在某些 Chromium / DevTools / 复杂窗口上可能非常慢，甚至出现长时间阻塞。当前实现只在 `WindowsForms10.*`、`HwndWrapper*`、`XAML`、`ApplicationFrameWindow`、`Windows.UI.Core.CoreWindow` 这一类更可能受益的窗口上启用深层向下遍历。
*   **日志必须带耗时**：native 的 `[hdr-capture-native][uia]` 日志需要保留 `elapsed=...ms`，后续出现卡顿时先看单次探测耗时，再决定是否继续扩大 walker 使用范围。
*   **如果“更深识别”与“响应速度”冲突，先保响应**：宁可暂时只返回窗口候选，也不要让截图 Overlay 出现明显卡顿或假死。

### 原生接口

`native/src/lib.rs` 额外暴露了两组 UI Automation 相关接口：

*   `get_ui_element_candidates_at_point(x, y, ignore_handle)`
*   `get_ui_elements_for_window(window_handle)`

当前 Overlay 只使用第一组接口来驱动界面元素模式；第二组接口保留给后续调试或扩展用途。

### JS / Rust 通信类型约束

本插件通过 **N-API (`napi-rs`)** 在 JavaScript 和 Rust 之间传递数据，这一层的类型需要严格控制，尤其是窗口句柄和坐标。

*   **坐标字段**：JS 传给 Rust 的 `x`、`y`、`width`、`height`、`left`、`top`、`right`、`bottom` 必须使用普通 `number`。
*   **窗口句柄 / ignoreHandle**：当前 Rust 导出接口里使用的是 `i64`，而当前插件侧调用时必须传 **普通 `number`**，**不要传 `BigInt`**。
*   **原因**：这次排查中已经验证，JS 侧把 `BigInt` 传给 `napi-rs` 的 `i64` 参数时，会直接报错：
    *   `Failed to convert napi value BigInt into rust type i64`
*   **返回值防守**：JS 侧调用 native 接口后，不能假定返回值一定是数组或对象；在进入 `.map()`、`.slice()` 之前，需要先做 `Array.isArray(...)` 或空值判断。
*   **建议**：凡是从 Electron / Node Buffer 里读取窗口句柄时，如果最终要传给当前 Rust 导出函数，先显式转换成 `number`，并在日志中保留 `.toString()` 形式用于排查。

这条规则对以下路径尤其重要：

*   `src/main.js` -> `src/capture/index.js` -> `native/src/lib.rs`
*   Overlay 元素探测 IPC：`get-ui-element-candidates-at-point`

## 2026-03 HDR/SDR 白点处理补充

### SDR 白点优先级

HDR 截图路径中，SDR 输出白点按以下优先级使用：

*   **用户手动设置**：当设置页面关闭“优先使用系统 SDR 白点”时，使用 `sdrWhiteNits` 滑块值。
*   **系统 SDR 白点**：当开启“优先使用系统 SDR 白点”时，原生层通过 `QueryDisplayConfig + DisplayConfigGetDeviceInfo(DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL)` 读取当前显示器的 SDR 白点，并换算为 nits 后使用。
*   **兜底默认值**：如果系统读取失败，回退到保持原有行为的默认值 `203 nits`。

### 系统参数作用范围

*   当前仅将系统 SDR 白点用于 HDR 捕获后的 `scRGB -> sRGB` 转换。
*   `hdrMaxNits` 仍然保留为用户手动调整参数，暂未改为系统自动读取。
*   日志会记录当前屏幕读取到的 `system_sdr_white_level` 和 `system_sdr_white_nits`，便于排查颜色偏差。
