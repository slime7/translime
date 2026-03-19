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
