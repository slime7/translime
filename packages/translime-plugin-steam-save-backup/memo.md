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
│       └── sync/           # 远程同步（rclone 引擎）
│           ├── rclone.js       # rclone 子进程封装（执行/探测/取消注册）
│           ├── manifest.js     # 备份清单构建与对账计划（纯逻辑）
│           ├── engine.js       # 对账引擎 runSync（拉清单/改名/上传/下载）
│           ├── queue.js        # 串行同步队列
│           └── sync-service.js # 配置/持久状态/触发编排
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

*   **已卸载游戏的存档管理**: 扫描时把每个 Steam 游戏的云存档配置（`savePaths`，来自 remotecache.vdf）登记到插件配置 `settings.knownGames`（appid → { appid, name, savePaths }，`src/utils/known-games.js` 纯函数实现）。游戏卸载后扫描不到，但登记过且本地仍有备份的游戏以「未安装 · 仅存档管理」标识继续出现在列表中——`saveSources` 置空（`canBackup` 自然为 false，不支持新增备份），还原 / 删除 / 备注 / 同步照常可用；已安装游戏的实时扫描配置始终优先（登记条目随之更新，不重复列出），无备份的登记条目不展示，删除其全部备份后自然从列表消失。

*   **远程同步（rclone 引擎）**:
    *   **模型**: 远程是单一可靠源，多台本地各自与远程对账。备份目录不可变、目录名（时间戳）即幂等键，同步退化为集合对账：本地独有 → 上传；远端独有 → 下载；同名目录摘要不一致（同一备份在两端内容分叉）→ **同步冲突，不自动合并**。
    *   **冲突确认（Steam Cloud 式三选一）**: 冲突目录被排除在自动上传/下载之外并持久化到 `plugin.<id>.syncState.conflicts`（含两端 `backupTime` / `createdBy` 展示信息，判断依据即 info.json 摘要，无需额外字段）；游戏卡片显示红色「同步冲突」chip，新检出冲突时 snackbar 提醒，同步设置对话框内逐条给出「覆盖本地（以远程为准，回补下载）/ 覆盖远程（以本地为准，上传覆盖）/ 保留两份（本地改名 `<dir>-<machineId>` 保留并上传，远端原件回补）」三个处理按钮（`sync-resolve-conflict` IPC → `engine.resolveConflict`，处理成功后移除该冲突并触发一次对账确认）。不同时间戳目录的并集同步保持全自动——那是多设备收敛的正常路径。
    *   **打包同步（元数据外置）**: 远端一份备份 = `<gameId>/<时间戳>/` 目录下的 `data.zip`（adm-zip 纯 JS 打包，**不含 info.json**）与 `info.json`（独立存放）。存档目录常含大量小文件，逐文件同步在 SMB / 云盘上往返开销大；打包后每次备份只传一个文件。info.json 外置保证对账只拉各备份几 KB 的元数据即可比对摘要，无需下载/解包数据包；远端目录保持 `<gameId>/<时间戳>/` 结构，可直接浏览归属。**本地备份保持目录形态不变**（还原 / 浏览不受影响），打包只发生在传输与远端存储层。兼容远端散文件目录形态（`data_N`），对账时自动取回并打包上传替换，内容分叉同样走冲突确认（`remoteKind: 'dir'`）。
    *   **删除传播（按需）**: 删除确认框提供「同时删除远程存档」开关（仅同步已启用时显示），文案标注游戏名与精确远端路径（远端目录名是 gameId + 时间戳，不便人工确认归属）；勾选后由本地删除动作携带执行 `engine.deleteRemoteBackup`（整目录清理，条目不存在视为已删除），并联动移除该目录的未处理冲突条目；远程删除失败不影响本地删除，以 warning 返回。
    *   **完整性约定**: 上传先写 `data.zip.part` 再 `moveto` 改名（原子可见），info.json 收尾写入；下载先解包数据包、info.json 最后落盘——远端/本地目录缺 info.json 即传输中断残留，不进清单，下次对账自动补齐。`note` 备注是本地元数据，摘要比对时忽略。
    *   **引擎**: `rclone copy <target> <stage> --include /*/*/info.json` 一次拉取全部远端元数据（每份几 KB）构成清单（两端布局一致，同一 `buildManifest` 构建）；`rclone lsf <game> -R --files-only`（仅文件名，每游戏一次）识别数据包与散文件目录形态并收集散文件残留子目录；逐备份 `copyto <本地数据包> <dir>/data.zip.part` + `moveto` + `copyto info.json` 上传、`copyto <dir>/data.zip` + 解压 + `copyto info.json` 下载（`engine.uploadBackup` / `downloadBackup`）。目标支持 rclone remote（`mydrive:path`）与本地/UNC 路径（NAS、挂载盘）。
    *   **触发**: 仅手动触发。包括游戏备份弹窗的「同步」按钮、同步设置对话框内的「立即同步」按钮，以及冲突处理后的对账补跑。备份后在本地标记待上传提示，不自动推送；同步由串行队列执行，同一时刻仅单次运行，进行中的再次触发自动排队；失败直接记录错误信息交由 UI 展示，不进行自动重试。
    *   **状态**: `sync-get-status` 返回 phase（running/idle）、pending、配置、rclone 探测结果、脏游戏列表、未处理冲突清单、上次报告与错误信息；UI 轮询驱动（运行期 1.5s，空闲自停），游戏卡片显示「同步冲突 / 同步中 / 待上传 / 已同步」chip，工具栏同步按钮在失败时切换为 `cloud_off`。
    *   **远程管理**: 同步设置对话框内可创建、修改、删除远程，无需手动执行 `rclone config`。
        *   `sync-backend-types` 返回内置后端元数据（`src/utils/sync/rclone-config.js` 的 `BACKEND_TYPES`）：Google Drive / OneDrive / Dropbox 走 OAuth（`rclone authorize <type>` 本地回调，rclone 自动打开浏览器，授权链接经 `sync-authorize-url@<id>` 推送给 UI 作备用入口，`sync-cancel-authorize` 可中断）；WebDAV / SMB / SFTP / S3 兼容走表单凭据。
        *   `sync-create-remote` 校验必填项后执行：OAuth 后端 `rclone config create <name> <type> config_token=<json>`（token 不加 `--obscure`），表单后端 `rclone config create <name> <type> key=value... --obscure`（密码类字段由 rclone 混淆存储，且不做 trim——密码本身可能包含空格）；同名远程先 `config delete` 再重建。OneDrive 附加 `--auto-confirm` 自动完成驱动器选择。保存动作不做连接测试。
        *   `sync-test-remote` 连接测试（独立动作）：`rclone lsd <target>`（30s 超时）验证已保存远程的凭据与可达性。目标由 UI 传入远程名 + 远程目标中的子路径（如 SMB 的 `translime-smb:share`）——SMB 等后端的根路径列举（枚举共享名）不触发真实认证，不带子路径的结果不代表连接可用。认证失败且用户名含 `@` 而未填域时（rclone 不拆分 `user@domain`，Windows 目标按本地账户名匹配必然失败，手机客户端则靠发现阶段自动带入机器名作域），先经 `nbtstat` 查询目标 NetBIOS 机器名（`src/utils/sync/netbios.js`，仅 Windows）自动补上域重试，成功即写入配置并把发现的域回填到表单输入框（结果注明「已自动补上域 X」），重试失败则回退为提示手动填写；入口在远程表单动作栏左侧「测试连接」，仅当该类型对应的远程已存在时可用，结果直接展示在表单页底部（成功/失败与 rclone 原始错误）。
        *   `sync-get-remote` 读取远程配置（`rclone config show`）回填编辑表单的非密码字段；密码一律不回填，编辑时留空表示保持不变（存储态密码不保证是可解码的混淆串，且 `config show` 会输出 `*** ENCRYPTED ***` 掩码，编辑流程不依赖解码）。保存走 `sync-create-remote` 携带 `editName`：表单后端以 `rclone config update` 只更新非空字段（密码留空即跳过），表单清空的字段以 `rclone config unset` 从配置移除（写空串会被 rclone 原样存储，后端会拿到空选项），不改名不重建；后端类型在编辑模式锁定——改名规则是 `translime-<type>`，换类型等于新建另一名字的远程；OAuth 远程没有可编辑表单字段，「修改」不可用（重新授权走「新建 / 授权远程」）。
        *   `sync-delete-remote` 删除远程（条目不存在视为已删除）；只删除本机 rclone 配置中的连接凭据，不触碰远端数据（确认框注明）。远程目标正引用该远程时联动清空目标并刷新同步状态。
        *   远程统一命名 `translime-<type>`，写入系统 rclone 配置（不传 `--config`，复用用户已有配置）；创建成功后自动把远程目标填为 `<name>:`。
        *   主视图「远程位置」下拉（`sync-list-remotes`，条目含后端类型）行末提供「修改」「删除」按钮，与 rclone 下载链接（rclone.org/downloads）并列；下拉按远程位置记忆各自的目标（含手填子路径），切换互不覆盖，对话框打开时按已保存目标匹配所属远程（前缀匹配，支持 `translime-smb:share` 这类带子路径的目标）；设置中的 rclone 路径对同步与远程管理同时生效。
    *   **边界**: 不做远端自动清理与墓碑（删除走「同时删除远程存档」开关按需传播，未勾选时本地删除会在下次同步时从远端回补）；rclone 二进制不自带，探测系统 PATH 或用户在设置中填写路径；`machineId`（UUID）持久化在 `plugin.<id>.syncState`，新备份的 `info.json` 附带 `createdBy`。

## 4. 特别注意事项 (Special Notes)

*   **文档同步**: 每次完成新功能或修改核心逻辑后，**必须同步更新本文件 (`memo.md`)**，以保持项目的一致性与可维护性。
*   **版本号策略**: 版本号在分支合并（发布）时提升，开发阶段不改动版本号。
*   **当前状态**:
    *   状态: 稳定。核心备份/还原功能已实现；UI 已迁移到 mde-vue（Material 3 Expressive）；远程同步（rclone 引擎）已实现集合对账、打包传输（元数据外置）、串行队列、每游戏同步状态、插件内远程管理（创建 / 修改 / 删除 / 连接测试 / 域自动发现）、Steam Cloud 式同步冲突确认与按需删除传播；支持已卸载游戏的存档管理（云存档配置登记）。
*   **Vite 配置**: 主进程和 UI 使用不同的配置文件，请确保修改对应配置。
*   **构建**: `npm run build` 同时构建插件主逻辑和 UI。
