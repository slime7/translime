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
│       ├── save-watcher.js # 存档目录文件监控（fs.watch recursive + 防抖合并 + 同步抑制窗口 + 全屏暂停）
│       ├── auto-backup.js  # 自动备份调度（防抖合并 + 每游戏冷却 + trailing 补跑）
│       ├── fullscreen-watcher.js # 全屏程序检测（常驻 PowerShell，失败静默降级）
│       ├── custom-dirs.js  # 自定义存档目录枚举与去重
│       ├── custom-dir-removal.js # 自定义目录移除的备份清理（本地删除+远端墓碑，可注入 IO）
│       ├── fs-wrapper.js   # 文件系统命令封装
│       ├── save-sources.js # 存档来源模型（steam-cloud / custom-directory）
│       ├── steam.js        # Steam 路径检测与游戏扫描
│       ├── vdf-parser.js   # Steam VDF 文件解析器
│       ├── passthrough/    # 直通云存档（镜像同步 + 删除墓碑）
│       │   ├── meta.js     # 远端条目元数据与墓碑标记构造（纯逻辑）
│       │   ├── plan.js     # 条目对账计划分类（纯逻辑）
│       │   ├── engine.js   # rclone 编排（双向增量 / 墓碑写入 / 冲突处置）
│       │   └── service.js  # 配置管理、持久状态与独立操作编排
│       └── sync/           # 远程同步（rclone 引擎）
│           ├── rclone.js       # rclone 子进程封装（执行/探测/取消注册）
│           ├── manifest.js     # 备份清单构建与对账计划（含远端删除墓碑，纯逻辑）
│           ├── engine.js       # 对账引擎 runSync（拉清单/墓碑跟随/改名/上传/下载）
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
    *   **工具栏**: `SteamBackupToolbar` 仅保留「手动添加 / 刷新列表」两个按钮（统一 `filled-tonal` 变体）；页面宽度 < 640px 时由 ResizeObserver 收缩为图标按钮（带 tooltip 与 aria-label）。「打开备份目录 / 同步设置」在宿主插件页顶栏按钮区（见 3.5）。
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
    2.  `remove-custom-save-dir` 移除条目，**可选同时清理备份**：确认面板提供「删除本地备份」与「同时删除远程存档」开关——本地按该自定义游戏（`hashGameKey(gameName)`）的全部备份目录逐份删除；远端逐份走墓碑（`cleanupCustomDirBackups`，`utils/custom-dir-removal.js`，原 info.json 在本地删除前读取、best-effort 单份失败记告警不中断），完成后触发一次对账把墓碑传播给其他设备；未勾选则仅解除绑定，备份原样保留。
    3.  `scan-games` 时按游戏名（大小写不敏感）合并：与扫描游戏同名的目录并入该游戏 `saveSources`；未命中的条目按名称生成自定义游戏（appid 为 `custom-<名称哈希>`，`isCustom: true`），与 Steam 游戏一同出现在列表中参与备份/还原。

*   **已卸载游戏的存档管理**: 扫描时把每个 Steam 游戏的云存档配置（`savePaths`，来自 remotecache.vdf）登记到插件配置 `settings.knownGames`（appid → { appid, name, savePaths }，`src/utils/known-games.js` 纯函数实现）。游戏卸载后扫描不到，但登记过且本地仍有备份的游戏以「未安装 · 仅存档管理」标识继续出现在列表中——`saveSources` 置空（`canBackup` 自然为 false，不支持新增备份），还原 / 删除 / 备注 / 同步照常可用；已安装游戏的实时扫描配置始终优先（登记条目随之更新，不重复列出），无备份的登记条目不展示，删除其全部备份后自然从列表消失。

*   **远程同步（rclone 引擎）**:
    *   **模型**: 远程是单一可靠源，多台本地各自与远程对账。备份目录不可变、目录名（时间戳）即幂等键，同步退化为集合对账：本地独有 → 上传；远端独有 → 下载；同名目录摘要不一致（同一备份在两端内容分叉）→ **同步冲突，不自动合并**。
    *   **冲突确认（Steam Cloud 式三选一）**: 冲突目录被排除在自动上传/下载之外并持久化到 `plugin.<id>.syncState.conflicts`（含两端 `backupTime` / `createdBy` 展示信息，判断依据即 info.json 摘要，无需额外字段）；游戏卡片显示红色「同步冲突」chip，新检出冲突时 snackbar 提醒，同步设置对话框内逐条给出「覆盖本地（以远程为准，回补下载）/ 覆盖远程（以本地为准，上传覆盖）/ 保留两份（本地改名 `<dir>-<machineId>` 保留并上传，远端原件回补）」三个处理按钮（`sync-resolve-conflict` IPC → `engine.resolveConflict`，处理成功后移除该冲突并触发一次对账确认）。不同时间戳目录的并集同步保持全自动——那是多设备收敛的正常路径。
    *   **打包同步（元数据外置）**: 远端一份备份 = `<gameId>/<时间戳>/` 目录下的 `data.zip`（adm-zip 纯 JS 打包，**不含 info.json**）与 `info.json`（独立存放）。存档目录常含大量小文件，逐文件同步在 SMB / 云盘上往返开销大；打包后每次备份只传一个文件。info.json 外置保证对账只拉各备份几 KB 的元数据即可比对摘要，无需下载/解包数据包；远端目录保持 `<gameId>/<时间戳>/` 结构，可直接浏览归属。**本地备份保持目录形态不变**（还原 / 浏览不受影响），打包只发生在传输与远端存储层。兼容远端散文件目录形态（`data_N`），对账时自动取回并打包上传替换，内容分叉同样走冲突确认（`remoteKind: 'dir'`）。
    *   **删除传播（墓碑）**: 删除确认框提供「同时删除远程存档」开关（仅同步已启用时显示），文案标注游戏名与精确远端路径（远端目录名是 gameId + 时间戳，不便人工确认归属）；勾选后由本地删除动作携带执行 `engine.deleteRemoteBackup`——远端数据文件整体清理，但 info.json 保留并追加 `deleted / deletedAt / deletedBy` 标记（**墓碑**，参与摘要比对），并联动移除该目录的未处理冲突条目；远程删除失败不影响本地删除，以 warning 返回。对账时远端墓碑的语义：本地副本自动跟随删除（计入报告 `deletions` 并推送 `sync-notify` 通知）；本地备份的 `backupTime` 晚于 `deletedAt`（删除决定之后本机又重新备份过）→ 转**墓碑冲突**（`kind: 'tombstone'`），在同步设置中两选一：「恢复本备份」（以本地覆盖远端，墓碑被本地 info.json 覆盖，撤销删除）/「确认删除」（仅移除本地备份，墓碑保持）；本地没有该备份时不回补下载——已删备份不会在别的设备复活，也不允许仍持有它的端重新上传（`planSync` 对墓碑条目禁止 uploads/downloads）。墓碑永久保留（每份几 KB，不做 GC），防止后加入的设备复活备份。
    *   **完整性约定**: 上传先写 `data.zip.part` 再 `moveto` 改名（原子可见），info.json 收尾写入；下载先解包数据包、info.json 最后落盘——远端/本地目录缺 info.json 即传输中断残留，不进清单，下次对账自动补齐。`note` 备注是本地元数据，摘要比对时忽略。
    *   **引擎**: `rclone copy <target> <stage> --include /*/*/info.json` 一次拉取全部远端元数据（每份几 KB）构成清单（两端布局一致，同一 `buildManifest` 构建）；`rclone lsf <game> -R --files-only`（仅文件名，每游戏一次）识别数据包与散文件目录形态并收集散文件残留子目录；逐备份 `copyto <本地数据包> <dir>/data.zip.part` + `moveto` + `copyto info.json` 上传、`copyto <dir>/data.zip` + 解压 + `copyto info.json` 下载（`engine.uploadBackup` / `downloadBackup`）。目标支持 rclone remote（`mydrive:path`）与本地/UNC 路径（NAS、挂载盘）。
    *   **触发**: 手动触发（游戏备份弹窗的「同步」按钮、同步设置对话框内的「立即同步」、冲突处理后的对账补跑）与**文件监控自动触发**并存：`save-watcher`（`fs.watch` recursive，每目录一个监听，事件按目录防抖合并）监控可见游戏的存档路径，变更经 `auto-backup` 调度（每游戏防抖 3s + 最小冷却 10 分钟，冷却期内变更合并为冷却结束后的 trailing 补跑，执行期间到达的变更在执行完成后按防抖补跑）自动执行 `backupSave` 并立即触发对账上传；直通条目目录的变更直接触发对账（对账运行中自动排队）。**全屏暂停**：`fullscreen-watcher`（仅 Windows）常驻一个 PowerShell 子进程按 1.5s 采样前台窗口是否铺满所在显示器（排除 translime 自身与桌面/任务栏外壳），连续 2 次采样一致才切换；检测到全屏程序即整体挂起监控（`saveWatcher.pause()`，事件只记标记），退出后恢复并按静默宽限补发一次（游戏结束后统一补一次备份/同步）。检测不到（非 Windows、PowerShell 缺失、进程反复崩溃）就静默停用该功能，监控行为与此前一致；独占全屏（D3D exclusive）识别覆盖不佳，无边框全屏可稳定识别。插件 manifest 声明 `onAppReady` 激活事件：随宿主启动后台预扫描建立监控集，自动备份/自动同步不依赖是否打开过插件页；`pluginWillUnload` 关闭全部监控、停止全屏检测并取消调度。同步由串行队列执行，同一时刻仅单次运行，进行中的再次触发自动排队；失败直接记录错误信息交由 UI 展示，不进行自动重试。自动备份完成与远端删除跟随应用经 `sync-notify@<id>` 推送 UI（UI 未打开时仅落状态）。
    *   **状态**: `sync-get-status` 返回 phase（running/idle）、pending、配置、rclone 探测结果、脏游戏列表、未处理冲突清单、上次报告与错误信息；UI 轮询驱动（运行期 1.5s，空闲自停），游戏卡片显示「同步冲突 / 同步中 / 待上传 / 已同步」chip。
    *   **远程管理**: 同步设置对话框内可创建、修改、删除远程，无需手动执行 `rclone config`。
        *   `sync-backend-types` 返回内置后端元数据（`src/utils/sync/rclone-config.js` 的 `BACKEND_TYPES`）：Google Drive / OneDrive / Dropbox 走 OAuth（`rclone authorize <type>` 本地回调，rclone 自动打开浏览器，授权链接经 `sync-authorize-url@<id>` 推送给 UI 作备用入口，`sync-cancel-authorize` 可中断）；WebDAV / SMB / SFTP / S3 兼容走表单凭据。
        *   `sync-create-remote` 校验必填项后执行：OAuth 后端 `rclone config create <name> <type> config_token=<json>`（token 不加 `--obscure`），表单后端 `rclone config create <name> <type> key=value... --obscure`（密码类字段由 rclone 混淆存储，且不做 trim——密码本身可能包含空格）；同名远程先 `config delete` 再重建。OneDrive 附加 `--auto-confirm` 自动完成驱动器选择。保存动作不做连接测试。
        *   `sync-test-remote` 连接测试（独立动作）：`rclone lsd <target>`（30s 超时）验证已保存远程的凭据与可达性。目标由 UI 传入远程名 + 远程目标中的子路径（如 SMB 的 `translime-smb:share`）——SMB 等后端的根路径列举（枚举共享名）不触发真实认证，不带子路径的结果不代表连接可用。认证失败且用户名含 `@` 而未填域时（rclone 不拆分 `user@domain`，Windows 目标按本地账户名匹配必然失败，手机客户端则靠发现阶段自动带入机器名作域），先经 `nbtstat` 查询目标 NetBIOS 机器名（`src/utils/sync/netbios.js`，仅 Windows）自动补上域重试，成功即写入配置并把发现的域回填到表单输入框（结果注明「已自动补上域 X」），重试失败则回退为提示手动填写；入口在远程表单动作栏左侧「测试连接」，仅当该类型对应的远程已存在时可用，结果直接展示在表单页底部（成功/失败与 rclone 原始错误）。
        *   `sync-get-remote` 读取远程配置（`rclone config show`）回填编辑表单的非密码字段；密码一律不回填，编辑时留空表示保持不变（存储态密码不保证是可解码的混淆串，且 `config show` 会输出 `*** ENCRYPTED ***` 掩码，编辑流程不依赖解码）。保存走 `sync-create-remote` 携带 `editName`：表单后端以 `rclone config update` 只更新非空字段（密码留空即跳过），表单清空的字段以 `rclone config unset` 从配置移除（写空串会被 rclone 原样存储，后端会拿到空选项），不改名不重建；后端类型在编辑模式锁定——改名规则是 `translime-<type>`，换类型等于新建另一名字的远程；OAuth 远程没有可编辑表单字段，「修改」不可用（重新授权走「新建 / 授权远程」）。
        *   `sync-delete-remote` 删除远程（条目不存在视为已删除）；只删除本机 rclone 配置中的连接凭据，不触碰远端数据（确认框注明）。远程目标正引用该远程时联动清空目标并刷新同步状态。
        *   远程统一命名 `translime-<type>`，写入系统 rclone 配置（不传 `--config`，复用用户已有配置）；创建成功后自动把远程目标填为 `<name>:`。
        *   主视图「远程位置」下拉（`sync-list-remotes`，条目含后端类型）行末提供「修改」「删除」按钮，与 rclone 下载链接（rclone.org/downloads）并列；下拉按远程位置记忆各自的目标（含手填子路径），切换互不覆盖，对话框打开时按已保存目标匹配所属远程（前缀匹配，支持 `translime-smb:share` 这类带子路径的目标）；设置中的 rclone 路径对同步与远程管理同时生效。
    *   **边界**: 不做远端自动清理；墓碑已实现（见「删除传播」），未勾选「同时删除远程存档」时本地删除仍会在下次同步时从远端回补；rclone 二进制不自带，探测系统 PATH 或用户在设置中填写路径；`machineId`（UUID）持久化在 `plugin.<id>.syncState`，新备份的 `info.json` 附带 `createdBy`。备份区墓碑要求各设备插件版本一致——未升级的旧版本端会把墓碑当普通备份，下载时因缺 data.zip 报错。

*   **直通云存档（独立区块）**: 选定的自定义目录跳过本地备份，与远程保持镜像同步。与备份区（Steam 云存档 + 备份目录同步）完全隔离，避免与 Steam 云存档混淆。
    *   **数据模型**: 条目存于 `plugin.<id>.settings.passthroughDirs`（`[{ name, dir }]`），与 `customSaveDirs` 完全分离，不进入 `scan-games`/备份流程。`name` 用户自定义且唯一（大小写不敏感去重），条目 ID = `hashGameKey(name)`（`passthrough/meta.js` 的 `buildEntryId`）——按名称而非路径生成，不同机器的本地路径不同，名称是多端对齐的键。`dir` 必须存在但**允许为空目录**（新设备先建空目录拉取的场景）。
    *   **远端布局与隔离**: `<target>/passthrough/<entryId>/` 下镜像存档文件 + `.translime/meta.json`（`{ schemaVersion, entryId, name, updatedAt, updatedBy, deleted, deletedAt?, deletedBy? }`）。备份对账只按 `--include /*/*/info.json` 拉取元数据，`.translime/meta.json` 不命中——备份引擎天然看不见直通数据；直通引擎只访问 `<target>/passthrough/` 子树。复用备份同步的 rclone 远程目标与串行队列（每次对账在备份对账之后附带直通对账，失败仅记录直通自身状态）。
    *   **同步算法**（`passthrough/plan.js` 纯函数分类 + `engine.js` 执行）: 一次 `rclone copy <target>/passthrough <stage> --include /*/.translime/meta.json` 批量拉取全部条目 meta 后逐条目分类：远端墓碑 + 本地无更新（最新 mtime ≤ `deletedAt`）→ **自动删除本地并通知**；本地在删除后有更新或删除时间不可解析 → **删除冲突**待确认（「保留本机存档」= 全量上传撤销删除 /「确认删除」= 移除本地）；本地目录缺失 → **不自动回补**（避免与用户删除动作对抗），UI 提供「恢复下载」整目录回补；两端都在 → 双向增量 `rclone copy --update --exclude .translime/**`（先下后上，`--update` 仅覆盖较新一方，两端同时编辑时**较新者胜**），数据先行、meta 收尾写非删除标记。同步执行期间对本地目录的监控处于抑制窗口（`beforeWrite/afterWrite` 钩子 + 释放后 3s 静默宽限），防止同步回写触发回环；抑制期内发生过真实变更则在宽限后补发一次。
    *   **取消链接与墓碑**: 直通条目**没有「删除存档」动作**，只有「取消链接」——本机存档目录始终保留；勾选「同时删除远程存档」时 `purge` 远端条目并写入 `deleted: true` 的 meta（墓碑），其他端对账时自动跟随删除各自的本地副本（本地在删除后有更新的端转冲突待确认）；远程删除失败时不解除绑定，可重试。不勾选则仅解除绑定，远端数据保持原样。墓碑永久保留（每条几 KB）。
    *   **UI**: 插件页顶部「存档备份 | 直通云存档」`mat-btn-group` 整页切换，两块互不可见。直通条目**复用备份区的卡片形态**（`GameGrid`/`GameCard` 的 passthrough 分支：无隐藏按钮、无备份数芯片，状态芯片为 删除冲突 / 本地缺失 / 同步中 / 直通已启用），点击打开 `PassthroughDetailsDialog`（与备份弹窗同构）：按状态展示内容（冲突处置按钮 / 本地缺失+恢复下载 / 正常状态与最近对账），路径与远端位置、取消链接（含「同时删除远程」开关，本地缺失时默认勾选）、打开目录、立即同步；无备份/还原概念。`usePassthrough` 组合式函数，`preview-mocks.mjs` 覆盖全部直通 IPC。
    *   **IPC**: `passthrough-list` / `passthrough-add` / `passthrough-remove`（含 `deleteRemote`）/ `passthrough-open-dir` / `passthrough-restore` / `passthrough-resolve`（宿主注册为 `事件名@插件ID`）；直通状态挂在 `sync-get-status` 载荷的 `passthrough` 段。
    *   **边界**: 文件级删除不自动传播（会被下次对账回补），仅条目级删除走墓碑；`--update` 较新者胜，两端同时编辑同一文件会丢较旧一方的改动；直通对账依赖备份同步的队列门禁（未配置远程目标时不运行）。

### 3.5 宿主顶栏按钮区 (Host Title-Bar Actions)

*   插件经 SDK `setTitleBarActions(pluginId, actions)`（主进程 API，需宿主 `>= 0.8.1`）在**宿主插件页顶栏**（inspect 按钮旁）声明公共操作按钮，与插件自身 UI 分离——两个视图（备份/直通）都能使用。模板结构类似 Electron Menu：`{ label, icon, iconOnly, tooltip, enabled, visible, click }` 直按钮或 `{ ..., submenu: [...] }` 下拉菜单。
*   本插件注册两个图标按钮：「打开备份目录」（主进程直接 `shell.openPath` 备份根目录，与 `open-backup-dir` IPC 共用 `openBackupRoot`）与「同步设置」（`notifyClient({ kind: 'open-sync-settings' })` 推送插件 UI，任意视图弹出 `SyncSettingsDialog`）。
*   宿主在插件停用/重启时自动清除；`pluginWillUnload` 中也显式传 `null` 清除。宿主过旧时 API 返回 `false` 静默降级，不影响其余功能。

## 4. 特别注意事项 (Special Notes)

*   **文档同步**: 每次完成新功能或修改核心逻辑后，**必须同步更新本文件 (`memo.md`)**，以保持项目的一致性与可维护性。
*   **版本号策略**: 版本号在分支合并（发布）时提升，开发阶段不改动版本号。
*   **当前状态**:
    *   状态: 稳定。核心备份/还原功能已实现；UI 已迁移到 mde-vue（Material 3 Expressive）并分为「存档备份 / 直通云存档」两个隔离视图；远程同步（rclone 引擎）已实现集合对账、打包传输（元数据外置）、串行队列、每游戏同步状态、插件内远程管理（创建 / 修改 / 删除 / 连接测试 / 域自动发现）、Steam Cloud 式同步冲突确认、远端删除墓碑（自动跟随删除 + 墓碑冲突两选一 + 上传复活拦截）、文件监控自动同步（自动备份冷却调度 + 直通镜像同步 + 全屏程序自动暂停）；支持已卸载游戏的存档管理（云存档配置登记）；「打开备份目录 / 同步设置」经宿主顶栏按钮区（`setTitleBarActions`，需宿主 >= 0.8.1）在任意视图可用。
*   **自动同步参数**: 监控防抖 2s / 同步后静默宽限 3s / 自动备份防抖 3s / 每游戏冷却 10 分钟，集中定义在 `src/index.js`（`WATCHER_*` / `AUTO_BACKUP_*` 常量），调参后需同步本文件。
*   **Vite 配置**: 主进程和 UI 使用不同的配置文件，请确保修改对应配置。
*   **构建**: `npm run build` 同时构建插件主逻辑和 UI。
