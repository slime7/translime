# Translime Plugin: Steam Save Backup (`translime-plugin-steam-save-backup`)

## 1. 项目概述 (Project Overview)

本插件是一个用于 **Translime** 的 Steam 游戏存档备份与还原工具，支持自动扫描游戏、手动备份/还原以及管理备份历史。

- **插件名称**: `translime-plugin-steam-save-backup`
- **功能描述**: 自动/手动备份和还原 Steam 游戏存档。
- **技术栈**:
    - **Frontend**: Vue 3, Vuetify 4, Vite
    - **Backend**: Electron (Node.js)

## 2. 目录结构说明 (Directory Structure)

```
packages/translime-plugin-steam-save-backup/

├── dist/                   # 构建产物 (DO NOT EDIT)
│   ├── index.cjs.js        # 主进程包
│   └── ui.esm.js           # 渲染进程包
├── src/                    # 源代码
│   ├── index.js            # 主进程入口 (Main Process Entry)
│   ├── ui/                 # 渲染进程 (UI)
│   │   └── ui.vue          # 插件 UI 主组件
│   └── utils/              # 逻辑与辅助工具 (Logic & Helpers)
│       ├── backup.js       # 备份/还原核心逻辑
│       ├── fs-wrapper.js   # 文件系统命令封装
│       ├── steam.js        # Steam 路径检测与游戏扫描
│       └── vdf-parser.js   # Steam VDF 文件解析器
├── package.json            # 依赖项与插件元数据
├── vite.config.js          # 主进程构建配置
└── ui.vite.config.js       # UI 构建配置
```

## 3. 开发规范 (Development Guidelines)

### 3.1 环境隔离 (Environment Isolation)

严格区分 **主进程** 和 **渲染进程** 的代码逻辑与 API 使用：

*   **主进程 (Main Process)**
    *   **入口文件**: `src/index.js`, `src/utils/*.js`
    *   **可用 API**: Node.js API (`fs`, `path`), `getMainStore()`, `shell`
    *   **禁用 API**: DOM API, `window`, UI hooks (`useIpc`, `useWindowControl`)

*   **渲染进程 (Renderer Process)**
    *   **入口文件**: `src/ui/ui.vue`
    *   **可用 API**: Vue 3, Vuetify 4, `useIpc()`, `getPluginSetting()`
    *   **禁用 API**: 直接 Node.js API (除非通过 IPC), `getMainStore()`

### 3.2 IPC 通信 (IPC Communication)

*   **调用格式**: `ipc.invoke('action@translime-plugin-steam-save-backup', payload)`
*   **命名规范**: 事件名必须包含插件 ID 后缀 (`@translime-plugin-steam-save-backup`) 以避免冲突。
*   **处理逻辑**: 在 `src/index.js` 的 `ipcHandlers` 数组下定义。

### 3.3 UI 开发 (UI Development)

*   **1. 设置界面 (`src/ui/ui.vue`)**:
    *   **框架**: Vue 3 + Vuetify 4。
    *   **图标**: 直接使用 Material Design Icons 名称 (例如 `<v-icon>home</v-icon>`)，**不要**使用 `mdi-home`。
    *   **样式注入**: 使用 `vite-plugin-css-injected-by-js`，配置唯一的 `styleId`。
    *   **CSS**: 使用 `<style scoped>`。

### 3.4 核心流程 (Core Workflow)

*   **备份流程**:
    1.  扫描 Steam 安装目录 (`src/utils/steam.js`)。
    2.  解析 VDF 文件获取 LibraryFolders。
    3.  查找游戏安装目录和对应的存档路径。
    4.  调用 `backupSave` (`src/utils/backup.js`) 将存档复制到备份目录。
    5.  生成 `backup_info.json` 记录元数据。

*   **还原流程**:
    1.  读取备份目录下的 `backup_info.json`。
    2.  调用 `restoreSave` 将备份文件覆盖回原存档路径。

## 4. 特别注意事项 (Special Notes)

*   **文档同步**: 每次完成新功能或修改核心逻辑后，**必须同步更新本文件 (`memo.md`)**，以保持项目的一致性与可维护性。
*   **当前状态**:
    *   状态: 稳定。核心备份/还原功能已实现。
    *   近期更改: 重构 `steam.js` 中 remotecache.vdf 的 root 路径映射，基于 Steam SDK `ERemoteStorageFileRoot` 枚举补全 0-18 全部 Root ID，新增 macOS/Linux 跨平台支持，将路径解析逻辑提取为独立的 `resolveRootPath()` 函数。
*   **Vite 配置**: 主进程和 UI 使用不同的配置文件，请确保修改对应配置。
*   **构建**: `npm run build` 同时构建插件主逻辑和 UI。
