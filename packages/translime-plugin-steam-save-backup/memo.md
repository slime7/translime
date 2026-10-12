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
│   │   ├── components/     # UI 子组件（游戏卡片/详情对话框/自定义目录对话框/远程同步对话框/直通云存档视图等）
│   │   ├── composables/    # useSteamSaveBackup / useSyncStatus 组合式状态
│   │   └── preview-mocks.mjs # preview 模式声明式 IPC mock
│   └── utils/              # 逻辑与辅助工具 (Logic & Helpers)
│       ├── backup.js       # 备份/还原核心逻辑
│       ├── save-watcher.js # 存档目录文件监控（fs.watch recursive + 防抖合并 + 同步抑制窗口 + 焦点暂停）
│       ├── auto-backup.js  # 自动备份调度（防抖合并 + 每游戏冷却 + trailing 补跑）
│       ├── focus-watcher.js # 宿主窗口焦点监控（Electron 焦点事件驱动，跨平台）
│       ├── focus-state.js  # 焦点状态防抖确认（纯逻辑）
│       ├── custom-dirs.js  # 自定义存档目录枚举与去重
│       ├── custom-dir-removal.js # 自定义目录移除的备份清理（本地删除+远端墓碑，可注入 IO）
│       ├── fs-wrapper.js   # 文件系统命令封装
│       ├── save-sources.js # 存档来源模型（steam-cloud / custom-directory）
│       ├── steam.js        # Steam 路径检测与游戏扫描
│       ├── vdf-parser.js   # Steam VDF 文件解析器
│       ├── passthrough/    # 直通云存档（数据包快照同步 + 删除墓碑）
│       │   ├── meta.js     # 远端条目元数据与墓碑标记构造（纯逻辑）
│       │   ├── plan.js     # 条目对账计划分类：水位判定 noop/上传/下载方向（纯逻辑）
│       │   ├── engine.js   # rclone 编排（数据包上传下载 / 墓碑写入 / 冲突处置）
│       │   ├── discover.js # 远端条目发现（拉取 meta 概览，跳墓碑）
│       │   └── service.js  # 配置管理、持久状态（含水位）与独立操作编排
│       └── sync/           # 远程同步（rclone 引擎）
│           ├── rclone.js       # rclone 子进程封装（执行/探测/取消注册）
│           ├── manifest.js     # 备份清单构建与对账计划（含远端删除墓碑，纯逻辑）
│           ├── engine.js       # 对账引擎 runSync（拉清单/墓碑跟随/改名/上传/下载）
│           ├── discover.js     # 远程备份发现（拉取 info.json 概览 + 本地已添加判定）
│           ├── queue.js        # 串行同步队列
│           └── sync-service.js # 配置/持久状态/触发编排（附带直通对账）
├── tests/                  # vitest 单元测试（utils 与 sync 模块）
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
*   **UI 侧 `useIpc`**: 监听主进程推送（`.on` / `.detach`）必须传插件 ID —— `useIpc(PLUGIN_ID)` 才会自动补 `@插件ID` 后缀；无参调用不补后缀，裸事件名匹配不上 `事件名@插件ID` 推送。`.invoke` 事件名已显式带后缀（SDK 对带 `@` 的事件名原样保留），两种写法混用安全。
*   **主进程推送**: 延迟上下文（同步队列 / 文件监控回调 / 宿主顶栏动作）里调用 `sendToClient` 时 ALS 已失效，会退回主窗口 sender——`notifyClient` 统一以 `'all'` 广播，webview 按自身通道过滤，其他窗口无监听不受影响。
*   **日志**: 主进程日志统一走 SDK `useLogger()`（宿主侧返回 console 兼容包装：winston 的 `log(level, message)` 签名与 console 不同，SDK 已屏蔽，插件不要直接用 `global.mainStore.logger`）。

### 3.3 UI 开发 (UI Development)

*   **1. 主界面 (`src/ui/ui.vue` 与 `src/ui/components/`)**:
    *   **框架**: Vue 3 + mde-vue（宿主通过 `window.mde$` 提供运行时，插件不打包组件库；需要宿主 `engines.translime >= 0.7.0`）。模板中直接使用 `mat-*` 标签，SDK 编译期自动注入组件。
    *   **布局**: 页面根为 `mat-layout`（自带 `overflow:auto`，滚动条贴页面边缘），顶部操作放 `mat-app-bar`（默认插槽为标题、`trailing` 插槽为操作按钮，随滚动停靠/填色）；页面高度锚定 `100dvh`（preview 模式回退 `100%`），不依赖宿主 `#app` 高度链，避免文档+内容双层滚动。
    *   **工具栏**: `SteamBackupToolbar` 仅保留「手动添加 / 刷新列表」两个按钮（统一 `filled-tonal` 变体）；页面宽度 < 640px 时由 ResizeObserver 收缩为图标按钮（带 tooltip 与 aria-label）。「打开备份目录 / 同步设置 / 发现远程数据」在宿主插件页顶栏按钮区（见 3.5）。
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
    1.  主页面工具栏「手动添加」打开 `CustomSaveDirsDialog`；游戏名手动填写（支持非 Steam 游戏），选择目录后走 `add-custom-save-dir` IPC 校验并写入 `plugin.<id>.settings.customSaveDirs`（`[{ gameName, dir }]`）。目录必须存在且含文件；发现远程备份的添加流程携带 `allowEmptyDir` 放行空目录（新设备先登记游戏、稍后同步拉取备份）。
    2.  `remove-custom-save-dir` 移除条目，**可选同时清理备份**：确认面板提供「删除本地备份」与「同时删除远程存档」开关——本地按该自定义游戏（`hashGameKey(gameName)`）的全部备份目录逐份删除；远端逐份走墓碑（`cleanupCustomDirBackups`，`utils/custom-dir-removal.js`，原 info.json 在本地删除前读取、best-effort 单份失败记告警不中断），完成后触发一次对账把墓碑传播给其他设备；未勾选则仅解除绑定，备份原样保留。
    3.  `scan-games` 时按游戏名（大小写不敏感）合并：与扫描游戏同名的目录并入该游戏 `saveSources`；未命中的条目按名称生成自定义游戏（appid 为 `custom-<名称哈希>`，`isCustom: true`），与 Steam 游戏一同出现在列表中参与备份/还原。

*   **已卸载游戏的存档管理**: 扫描时把每个 Steam 游戏的云存档配置（`savePaths`，来自 remotecache.vdf）登记到插件配置 `settings.knownGames`（appid → { appid, name, savePaths }，`src/utils/known-games.js` 纯函数实现）。游戏卸载后扫描不到，但登记过且本地仍有备份的游戏以「未安装 · 仅存档管理」标识继续出现在列表中——`saveSources` 置空（`canBackup` 自然为 false，不支持新增备份），还原 / 删除 / 备注 / 同步照常可用；已安装游戏的实时扫描配置始终优先（登记条目随之更新，不重复列出），无备份的登记条目不展示，删除其全部备份后自然从列表消失。

*   **远程同步（rclone 引擎）**:
    *   **模型**: 远程是单一可靠源，多台本地各自与远程对账。备份目录不可变、目录名（时间戳）即幂等键，同步退化为集合对账：本地独有 → 上传；远端独有 → 下载；同名目录摘要不一致（同一备份在两端内容分叉）→ **同步冲突，不自动合并**。
    *   **冲突确认（Steam Cloud 式三选一）**: 冲突目录被排除在自动上传/下载之外并持久化到 `plugin.<id>.syncState.conflicts`（含两端 `backupTime` / `createdBy` 展示信息，判断依据即 info.json 摘要，无需额外字段）；游戏卡片显示红色「同步冲突」chip，新检出冲突时 snackbar 提醒，同步设置对话框内逐条给出「覆盖本地（以远程为准，回补下载）/ 覆盖远程（以本地为准，上传覆盖）/ 保留两份（本地改名 `<dir>-<machineId>` 保留并上传，远端原件回补）」三个处理按钮（`sync-resolve-conflict` IPC → `engine.resolveConflict`，处理成功后移除该冲突并触发一次对账确认）。不同时间戳目录的并集同步保持全自动——那是多设备收敛的正常路径。
    *   **打包同步（元数据外置）**: 远端单份备份包含 `<gameId>/<时间戳>/` 下的 `data.zip`（adm-zip 纯 JS 打包，不含 info.json）与独立的 `info.json`（元数据）。数据与元数据分离便于对账时仅拉取元数据比对摘要。本地备份保持目录形态不变。
    *   **删除传播（墓碑）**: 删除确认框提供「同时删除远程存档」开关；勾选后执行远程删除并写入追加 `deleted / deletedAt / deletedBy` 标记的 info.json（墓碑）。对账时其他设备跟随删除本地副本；若本地备份晚于删除时间则转为墓碑冲突（可选择恢复备份或确认删除）。
    *   **完整性约定**: 上传先写 `data.zip.part` 再原子重命名，最后写入 info.json；下载先解包数据包，最后写入 info.json。缺 info.json 视为传输中断残留，下次对账自动补齐。
    *   **引擎**: `rclone copy <target> <stage> --include /*/*/info.json` 批量拉取远端元数据构建清单；逐备份上传 `copyto data.zip.part` + `moveto` + `copyto info.json`，下载 `copyto data.zip` + 解压 + `copyto info.json`。支持 rclone remote 与本地/UNC 路径。
    *   **触发**: 手动触发与文件监控自动触发并存。`save-watcher` 监控存档目录，变更经 `auto-backup` 防抖与冷却调度后自动备份并触发同步；直通条目变更直接触发对账。`focus-watcher` 在宿主窗口无焦点时挂起监控，重获焦点后恢复。
    *   **状态**: `sync-get-status` 返回运行状态、配置、脏游戏列表、冲突清单与上次报告；UI 轮询展示同步状态芯片。
    *   **远程管理**: 同步设置对话框内可创建、修改、删除远程配置与测试连接。OAuth 后端通过本地回调授权，表单后端填写凭据创建。
    *   **远程数据发现**: 查看远端已有数据并按需登记。入口为顶栏按钮「发现远程数据」。支持备份按游戏登记为本地自定义存档，直通条目按目录登记并拉取。
    *   **边界**: 本地删除未勾选删除远程时下次对账将从远端回补；rclone 优先探测系统 PATH 或使用自定义路径。

*   **直通云存档（独立区块）**: 选定的自定义目录跳过本地备份，与远程保持「本地目录 ↔ 远端数据包」的快照镜像同步，与备份区隔离。
    *   **数据模型**: 条目存于 `settings.passthroughDirs`（`[{ name, dir }]`）。条目 ID 由名称生成（跨设备一致）。目录允许为空（用于新设备拉取）。
    *   **远端布局**: `<target>/passthrough/<entryId>/` 下包含 `data.zip`（本地存档快照）与独立的 `meta.json`。数据包与 meta 以外的冗余条目在对账后清理。
    *   **同步算法**: 条目级快照同步。批量拉取远端条目 meta 并获取远端文件结构，逐条目判定：
        *   远端墓碑且本地无新变更：自动删除本地目录并通知；本地有新变更则转为删除冲突待确认。
        *   本地目录缺失：不自动回补，支持在详情中手动恢复下载。
        *   远端无条目：打包上传本地快照并创建 meta。
        *   两端均存在：依据上次同步水位与本地文件清单（相对路径与修改时间/大小）比对。双端均无变更跳过；仅本地有变更则打包上传；仅远端有变更则下载并快照替换本地目录（先重命名备份旧目录，解压核对完整后再移除备份，失败则回滚）；双端均有变更时转为内容冲突待用户确认（基线未知时按最新修改时间比对决定方向）。
        *   下载解压时统一使用远端更新时间作为本地文件时间戳，并重新生成清单作为下次比对基准。
    *   **冲突处理**:
        *   删除冲突：可选择保留本机存档（重新上传并撤销删除）或确认删除本地。
        *   内容冲突：可选择保留本机存档（上传覆盖远端）或采用远端存档（快照替换本地）。
    *   **取消链接与墓碑**: 取消链接仅解除绑定，本地目录保留；勾选「同时删除远程存档」时清理远端数据并写入删除墓碑，通知其他设备跟随删除。
    *   **UI**: 顶部「存档备份 | 直通云存档」视图切换。直通条目使用卡片展示，点击打开详情弹窗进行冲突处理、恢复下载、取消链接与立即同步。
    *   **IPC**: 支持条目增删查、打开目录、恢复下载与冲突处置，状态集成于 `sync-get-status`。远端条目可通过「发现远程数据」登记到本地。

### 3.5 宿主顶栏按钮区 (Host Title-Bar Actions)

*   插件经 SDK `setTitleBarActions(pluginId, actions)`（主进程 API，需宿主 `>= 0.8.1`）在**宿主插件页顶栏**（inspect 按钮旁）声明公共操作按钮，与插件自身 UI 分离——两个视图（备份/直通）都能使用。模板结构类似 Electron Menu：`{ label, icon, iconOnly, tooltip, enabled, visible, click }` 直按钮或 `{ ..., submenu: [...] }` 下拉菜单。
*   本插件注册三个图标按钮：「打开备份目录」（主进程直接 `shell.openPath` 备份根目录，与 `open-backup-dir` IPC 共用 `openBackupRoot`）、「同步设置」（`notifyClient({ kind: 'open-sync-settings' })` 推送插件 UI，任意视图弹出 `SyncSettingsDialog`）与「发现远程数据」（`notifyClient({ kind: 'open-remote-discovery' })` 弹出 `DiscoverRemoteBackupsDialog`，`enabled` 跟随远程目标配置，见 3.4「远程数据发现」）。
*   宿主在插件停用/重启时自动清除；`pluginWillUnload` 中也显式传 `null` 清除。宿主过旧时 API 返回 `false` 静默降级，不影响其余功能。

## 4. 特别注意事项 (Special Notes)

*   **文档同步**: 每次完成新功能或修改核心逻辑后，**必须同步更新本文件 (`memo.md`)**，以保持项目的一致性与可维护性。
*   **版本号策略**: 版本号在分支合并（发布）时提升，开发阶段不改动版本号。
*   **当前状态**:
    *   状态: 稳定。核心备份/还原、多端远程同步（打包传输、集合对账、冲突确认、墓碑删除）、文件监控自动备份、已卸载游戏存档管理、直通云存档快照同步与远程数据发现均已实现。顶栏公共操作按钮在各视图可用。
*   **自动同步参数**: 监控防抖 2s / 同步后静默宽限 3s / 自动备份防抖 3s / 每游戏冷却 10 分钟，集中定义在 `src/index.js`（`WATCHER_*` / `AUTO_BACKUP_*` 常量），调参后需同步本文件。
*   **Vite 配置**: 主进程和 UI 使用不同的配置文件，请确保修改对应配置。
*   **构建**: `npm run build` 同时构建插件主逻辑和 UI。
