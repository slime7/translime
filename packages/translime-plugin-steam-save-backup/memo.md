# Translime Plugin: Steam Save Backup (`translime-plugin-steam-save-backup`)

## 1. 项目概述 (Project Overview)

本插件是一个用于 **Translime** 的 Steam 游戏存档备份与还原工具，支持自动扫描游戏、手动备份/还原以及管理备份历史。

- **插件名称**: `translime-plugin-steam-save-backup`
- **功能描述**: 自动/手动备份和还原 Steam 游戏存档。
- **技术栈**:
    - **Frontend**: Vue 3, mde-vue (Material 3, 宿主通过 `window.mde$` 提供运行时，插件不打包), TailwindCSS, Vite
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
│   │   ├── ui.vue          # 插件 UI 主组件
│   │   ├── components/     # UI 子组件（游戏卡片/详情对话框/自定义目录对话框/远程同步对话框等）
│   │   ├── composables/    # useSteamSaveBackup / useSyncStatus 组合式状态
│   │   └── preview-mocks.mjs # preview 模式声明式 IPC mock
│   └── utils/              # 逻辑与辅助工具 (Logic & Helpers)
│       ├── backup.js       # 备份/还原核心逻辑
│       ├── custom-dirs.js  # 自定义存档目录枚举与去重
│       ├── fs-wrapper.js   # 文件系统命令封装
│       ├── save-sources.js # 存档来源模型（steam-cloud / custom-directory）
│       ├── steam.js        # Steam 路径检测与游戏扫描
│       ├── vdf-parser.js   # Steam VDF 文件解析器
│       └── sync/           # 远程同步（rclone 引擎，见 docs/auto-sync-research.md）
│           ├── rclone.js       # rclone 子进程封装（执行/探测/取消注册）
│           ├── manifest.js     # 备份清单构建与对账计划（纯逻辑）
│           ├── engine.js       # 对账引擎 runSync（拉清单/改名/上传/下载）
│           ├── queue.js        # 串行队列 + 指数退避重试
│           └── sync-service.js # 配置/持久状态/触发编排
├── tests/                  # vitest 单元测试（utils 与 sync 模块）
├── docs/auto-sync-research.md # 远程同步调研（协议与方案依据）
├── package.json            # 依赖项与插件元数据
├── vite.config.mjs         # 主进程构建配置
└── ui.vite.config.mjs      # UI 构建配置
```

## 3. 开发规范 (Development Guidelines)

### 3.1 环境隔离 (Environment Isolation)

严格区分 **主进程** 和 **渲染进程** 的代码逻辑与 API 使用：

*   **主进程 (Main Process)**
    *   **入口文件**: `src/index.js`, `src/utils/*.js`
    *   **可用 API**: Node.js API (`fs`, `path`), `getMainStore()`, `shell`
    *   **禁用 API**: DOM API, `window`, UI hooks (`useIpc`, `useWindowControl`)

*   **渲染进程 (Renderer Process)**
    *   **入口文件**: `src/ui/ui.vue`, `src/ui/components/*.vue`
    *   **可用 API**: `useIpc()`, `useMatComponents()`, `getPluginSetting()`, `setPluginSetting()`, `useDialog()`
    *   **禁用 API**: 直接 Node.js API (除非通过 IPC), `getMainStore()`

### 3.2 IPC 通信 (IPC Communication)

*   **调用格式**: `ipc.invoke('action@translime-plugin-steam-save-backup', payload)`
*   **命名规范**: 事件名必须包含插件 ID 后缀 (`@translime-plugin-steam-save-backup`) 以避免冲突。
*   **处理逻辑**: 在 `src/index.js` 的 `ipcHandlers` 数组下定义。

### 3.3 UI 开发 (UI Development)

*   **1. 主界面 (`src/ui/ui.vue` 与 `src/ui/components/`)**:
    *   **框架**: Vue 3 + mde-vue（宿主通过 `window.mde$` 提供运行时，插件不打包组件库；需要宿主 `engines.translime >= 0.7.0`）。模板中直接使用 `mat-*` 标签，SDK 编译期自动注入组件。
    *   **布局**: 页面根为 `mat-layout`（自带 `overflow:auto`，滚动条贴页面边缘），顶部操作放 `mat-app-bar`（默认插槽为标题、`trailing` 插槽为操作按钮，随滚动停靠/填色）；页面高度锚定 `100dvh`（preview 模式回退 `100%`），不依赖宿主 `#app` 高度链，避免文档+内容双层滚动。
    *   **工具栏**: `SteamBackupToolbar` 三按钮统一 `filled-tonal` 变体；页面宽度 < 640px 时由 ResizeObserver 收缩为图标按钮（带 tooltip 与 aria-label）。
    *   **图标**: 使用 Material Design Icons (md) 风格 (例如 `<mat-icon icon="home" />`)，**不要**使用 `mdi-home`。
    *   **样式注入**: 使用 SDK 的 `createPluginCssIsolationPlugins`（内部封装 `vite-plugin-css-injected-by-js`），`styleId` 为插件名。
    *   **CSS**: 使用 `<style scoped>` + Tailwind utilities（`@layer tailwind` 降权引入）。
    *   **重要约定**: `mat-dialog` / `mat-snackbar` 内容会被 Teleport 到宿主 `@scope (.plugin-ui-loader...)` 样式隔离范围之外，**对话框与 snackbar 内部的样式必须写内联 `style`**，scoped 样式与 Tailwind 工具类在其中均不生效。

### 3.4 核心流程 (Core Workflow)

*   **备份流程**:
    1.  扫描 Steam 安装目录 (`src/utils/steam.js`)。
    2.  解析 VDF 文件获取 LibraryFolders。
    3.  查找游戏安装目录和对应的存档路径。
    4.  合并手动添加的自定义存档目录（`customSaveDirs` 设置 → `buildCustomDirSources`）。
    5.  调用 `backupSave` (`src/utils/backup.js`) 将存档复制到备份目录。
    6.  生成 `info.json` 记录元数据。

*   **还原流程**:
    1.  读取备份目录下的 `info.json`。
    2.  调用 `restoreSave` 将备份文件覆盖回原存档路径。

*   **自定义存档目录（手动添加）**:
    1.  主页面工具栏「手动添加」打开 `CustomSaveDirsDialog`；游戏名手动填写（支持非 Steam 游戏），选择目录后走 `add-custom-save-dir` IPC 校验并写入 `plugin.<id>.settings.customSaveDirs`（`[{ gameName, dir }]`）。
    2.  `remove-custom-save-dir` 按 gameName+dir 移除条目；添加/移除后 UI 重新扫描。
    3.  `scan-games` 时按游戏名（大小写不敏感）合并：与扫描游戏同名的目录并入该游戏 `saveSources`；未命中的条目按名称生成自定义游戏（appid 为 `custom-<名称哈希>`，`isCustom: true`），与 Steam 游戏一同出现在列表中参与备份/还原。

*   **远程同步（rclone 引擎，方案见 `docs/auto-sync-research.md`）**:
    *   **模型**: 远程是单一可靠源，多台本地各自与远程对账。备份目录不可变、目录名（时间戳）即幂等键，同步退化为集合对账：本地独有 → 上传；远端独有 → 下载；同名目录摘要不一致（两机同秒备份）→ 本地改名为 `<ts>-<machineId>` 保留两份。
    *   **完整性约定**: 数据文件先复制，`info.json` 收尾写入——远端/本地目录只要缺 `info.json` 即视为传输中断残留，不进清单；下次对账自动补齐。`note` 备注是本地元数据，摘要比对时忽略。
    *   **引擎**: `rclone copy <target> <stage> --include /*/*/info.json` 一次拉取全部远端 `info.json` 构成清单；逐目录 `rclone copy --exclude info.json` + `rclone copyto .../info.json` 上传/下载。目标支持 rclone remote（`mydrive:path`，OAuth 由用户系统 rclone 配置承担）与本地/UNC 路径（NAS、挂载盘）。
    *   **触发**: 备份成功后（`onBackupCreated`，标记脏游戏）、插件激活后延迟 5s、对话框「立即同步」手动触发。串行队列 + 自动触发失败指数退避重试（30s→1m→2m，上限 3 次），手动触发取消等待中的重试立即执行。
    *   **状态**: `sync-get-status` 返回 phase（running/retry-wait/idle）、配置、rclone 探测结果、脏游戏列表与上次报告（perGame 上传/下载/冲突计数）；UI 轮询驱动（运行期 1.5s，空闲自停），游戏卡片显示「同步中 / 待上传 / 已同步」chip，工具栏同步按钮在失败时切换为 `cloud_off`。
    *   **v1 边界**: 不做远端自动清理与墓碑（删除由远端主导，本地删除会在下次同步时回补，删除确认框中有提示）；rclone 二进制不自带，探测系统 PATH 或用户在设置中填写路径；`machineId`（UUID）持久化在 `plugin.<id>.syncState`，新备份的 `info.json` 附带 `createdBy`。

## 4. 特别注意事项 (Special Notes)

*   **文档同步**: 每次完成新功能或修改核心逻辑后，**必须同步更新本文件 (`memo.md`)**，以保持项目的一致性与可维护性。
*   **当前状态**:
    *   状态: 稳定。核心备份/还原功能已实现；UI 已迁移到 mde-vue（Material 3 Expressive）；远程同步（rclone 引擎）已实现集合对账、串行队列与每游戏同步状态。
    *   近期更改: 新增远程同步功能（`src/utils/sync/`，依据 `docs/auto-sync-research.md` 的 rclone 方案）：`sync-get-status` / `sync-set-config` / `sync-check-rclone` / `sync-now` / `sync-cancel` IPC；工具栏「同步」按钮与 `SyncSettingsDialog`（启用开关、远程目标、rclone 路径与检测、立即同步/取消、上次对账摘要）；游戏卡片同步状态 chip；备份创建写入 `createdBy`（machineId）；`preview-mocks.mjs` 提供含同步状态的 preview mock。此前：UI 从 Vuetify 4 全量迁移到 mde-vue（组件由宿主 `window.mde$` 提供）；manifest 升级（`$schema`、`engines.translime >= 0.7.0`、显式 `activationEvents: ["onView"]`）；新增「手动添加」自定义存档目录功能；页面布局重构为 `mat-layout` + `mat-app-bar`，工具栏窄窗收缩为图标按钮。
*   **Vite 配置**: 主进程和 UI 使用不同的配置文件，请确保修改对应配置。
*   **构建**: `npm run build` 同时构建插件主逻辑和 UI。
