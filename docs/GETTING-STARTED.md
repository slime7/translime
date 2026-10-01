# GETTING STARTED

## 前置环境

- Node.js ≥ 18.20（`packages/app` 的 engines 要求）。
- pnpm 10（仓库为 pnpm workspace，锁文件为 `pnpm-lock.yaml`）。
- 宿主支持 Windows 与 Linux（包含 Wayland / X11 / SteamOS 等环境）作为运行与发布平台，CI 包含 windows-latest 与 ubuntu-latest 构建矩阵，打包目标涵盖 Windows（NSIS / Portable）与 Linux（AppImage / tar.gz）。
- 插件 `translime-plugin-hdr-capture` 含 Rust 原生模块，构建它需要 Rust 工具链（cargo、napi）。
- `packages/translime-plugin-bangumi-logs/docs/api` 是 git submodule，克隆或更新仓库后需要初始化。

## 安装

```text
git submodule update --init
pnpm install
```

## 最短运行

```text
pnpm dev
```

等价于 `pnpm -C packages/app run dev`，启动 Electron 宿主开发模式。

如需通过 CDP 调试实际 Electron 页面，运行：

```text
pnpm dev:cdp
```

该模式在本机 `http://127.0.0.1:9222` 开启 CDP，仅用于本地调试。

## 构建、测试与检查

- 构建宿主：`pnpm build:app`（产物在 `packages/app/dist`；electron-builder 打包输出在 `packages/app/dist_electron`）；Linux 构建：`pnpm build:app:linux`
- 宿主测试：`pnpm -C packages/app run test`（vitest）
- 宿主 e2e：`pnpm -C packages/app run test:e2e`（Playwright Electron；启动器会先以 `--vite-only` 模式重建 `packages/app/dist`，无需手动构建。e2e 依赖生产模式产物，若 dist 曾被 `pnpm dev` 覆盖为 dev 构建，直接运行 playwright 会因加载不到页面而失败）
- 宿主 lint：`pnpm -C packages/app run lint`
- 构建 SDK：`pnpm -C packages/sdk run build`（产物在 `packages/sdk/dist`，含类型声明）
- SDK lint：`pnpm -C packages/sdk run lint` 与 `pnpm -C packages/sdk run lint:style`
- 构建插件：`pnpm --filter <插件包名> run build`
- 插件测试：`pnpm --filter translime-plugin-bangumi-logs run test`、`pnpm --filter translime-plugin-hdr-capture run test`
- 检查并发布所有新版本：`pnpm run publish:package`；指定包补发：`pnpm run publish:package -- --name <包名>`。本地命令需要 npm 发布凭据，GitHub Actions 使用 Trusted Publishing/OIDC。

根目录 `package.json` 的 `lint` 脚本指向不存在的 `src/`，请使用各包的 lint 脚本。

## 目录结构

```text
packages/
├─ app/                       # 宿主应用（Electron）
│  ├─ src/main/               # 主进程：core/ 插件系统与宿主核心、utils/
│  ├─ src/renderer/           # 渲染进程：views/plugins/ 插件页与 webview、store/、hooks/
│  ├─ src/preload/            # 预加载桥
│  ├─ src/share/              # 主/渲染共享常量与工具
│  ├─ scripts/                # watch 与 build 编排
│  └─ tests/                  # vitest 单元测试
├─ sdk/                       # translime-sdk：运行时 API、Vite 集成、preview
├─ template-translime-plugin/ # 插件模板与开发指南
└─ translime-plugin-*/        # 各插件包
.github/
├─ workflows/                 # build / publish-package / github-page
└─ scripts/publish-package.mjs
.agents/
├─ plugin-scaffold/           # 插件脚手架脚本与变体参考
└─ rules/plugin-development.md
docs/                         # 项目文档体系
```

## 关键文件索引

| 文件 | 用途 |
| --- | --- |
| `packages/app/src/main/core/pluginLoader.js` | 插件系统主入口 |
| `packages/app/src/main/core/plugin-loader/constants.js` | 路径、状态、激活常量 |
| `packages/app/src/main/core/ipcHandler.js` | 宿主与插件 IPC handler 注册 |
| `packages/app/src/share/utils/ipcConstant.js` | IPC 事件名常量 |
| `packages/app/src/renderer/views/plugins/PluginRender.vue` | 插件 UI 渲染（webview） |
| `packages/sdk/src/index.d.ts` | SDK 公共 API 类型 |
| `packages/sdk/src/vite-plugin.js` | SDK Vite 集成 |
| `packages/template-translime-plugin/readme.md` | 插件开发指南 |
| `.agents/plugin-scaffold/create-plugin.mjs` | 插件脚手架脚本 |

## 常见开发任务

### 发布 SDK 或插件

1. 修改 `packages/sdk/package.json` 或对应 `packages/translime-plugin-*/package.json` 的稳定版本号。
2. 在本地完成对应包的构建与测试。
3. 将提交推送到 `dev`。当发布包的 `package.json` 变化时，GitHub Actions 会扫描所有允许发布的包。
4. Action 只发布本地版本高于 npm 最新版本且尚不存在的包；相同版本会跳过，低于 npm 最新版本会报错。
5. 发布失败时可在 Actions 页面手动运行 `Publish Packages`，输入准确包名进行补发。

发布范围由目录决定，仅包括 `packages/sdk` 与 `packages/translime-plugin-*`。`packages/app` 继续通过 GitHub Releases 分发，模板与文档 submodule 不参与 npm 发布。发布新插件的首个版本时，先使用 npm 2FA 手动发布并在 npmjs 配置该包的 GitHub Actions Trusted Publisher；后续版本由 Action 发布。

### 创建新插件

```text
node .agents/plugin-scaffold/create-plugin.mjs --name translime-plugin-your-name
```

可选参数：`--title`、`--description`、`--template`、`--repo`、`--force`。默认模板为 `packages/template-translime-plugin`，首个可用版本默认 `1.0.0`。

安装版宿主内置了同一份模板：插件中心的「创建开发插件」向导可以不依赖本仓库直接生成插件并自动链接进 `plugins_dev`，面向仓库外的插件开发者；本仓库内的开发继续使用脚手架命令。

### 在宿主中联调插件

优先使用宿主内置向导（无需手动链接）：

1. 在插件中心点击「创建开发插件」，选择「从模板创建」或「引入已有目录」。
2. 向导会自动把插件链接进 `<userData>/plugins_dev/node_modules`、开启"显示开发中插件"并刷新插件列表。
3. 在插件页面启用插件；插件卡片右键可「打开插件目录」。
4. 开启「显示开发中插件」后，宿主会监听各已启用开发插件的 `dist` 目录，构建产物变化时自动重启该插件；也可以用「刷新开发中插件」按钮或卡片右键「重启插件」手动刷新。

手动 link 的方式仍然可用：

1. 在插件包内构建插件（`pnpm --filter <插件包名> run build`）。
2. 把插件链接到宿主的开发插件目录 `<userData>/plugins_dev/node_modules`：在插件根目录执行 `pnpm link --global`，再在 `plugins_dev/node_modules` 目录执行 `pnpm link --global <包名>`；或在 `plugins_dev/node_modules` 目录直接执行 `pnpm link <插件包绝对路径>`。
3. 在宿主设置中开启"显示开发中插件"，进入插件页面启用并验证。
4. 重新构建后使用插件卡片上的重载入口刷新。

### 断点调试插件主进程

1. 在插件目录运行 `pnpm dev`（非生产构建输出 inline sourcemap）。
2. 宿主开发模式（`pnpm dev`）固定以 `--inspect=5858` 启动 Electron，插件主进程代码与宿主同进程运行。
3. 在 VSCode 中使用仓库根目录 `.vscode/launch.json` 的「附加到 translime 宿主主进程 (5858)」配置，即可直接在插件主进程源码中打断点。
4. 渲染进程需要 CDP 调试时，用 `pnpm dev:cdp`（9222 端口）启动宿主并使用 launch.json 的对应配置；插件 UI 也可在插件页标题栏用 inspect 按钮打开 webview devtools。

### 调试插件 UI（preview 模式）

部分插件提供 `preview:ui` 脚本（如 `pnpm --filter translime-plugin-example run preview:ui`），在普通浏览器中运行 SDK 提供的 preview shell，mock 宿主 API。在 `translimeSdk()` 配置 `previewIpcMocks` 指向一个默认导出 `{ [事件名]: (...args) => result }` 的模块，可让 `ipc.invoke` 在 preview 中返回声明式 mock 结果。涉及布局、主题、窗口模式与宿主集成行为时，以宿主内效果为准。

## 常见故障

| 现象 | 处理 |
| --- | --- |
| 插件卡片显示 `build-missing` | 插件未构建或产物缺失，运行该插件的 build 脚本 |
| 插件卡片显示 `incompatible` | 插件 `engines.translime` 声明的宿主版本范围与当前宿主不匹配，升级宿主或联系插件作者调整范围 |
| 插件卡片显示 `blocked` | 插件声明的依赖插件未启用，先启用依赖 |
| 隔离插件（`plugin.isolated: true`）显示 `load-error` 并提示超时 | 插件 `pluginDidLoad` 阻塞或入口加载失败，查看宿主日志中该插件的输出 |
| SDK 报 "在隔离模式下不可用" | 隔离插件调用了 `getMainStore` / `usePluginConfig` / `usePluginInterop`，改用 IPC handler 或去掉 isolated 声明 |
| `bangumi-logs/docs/api` 目录为空 | submodule 未初始化，执行 `git submodule update --init` |
| `hdr-capture` 构建失败 | 缺少 Rust 工具链或 napi 依赖 |
| 修改插件 UI 后宿主内无变化 | webview 实例被缓存，使用插件卡片重载入口刷新 |
| 安装依赖报错 | 统一使用 pnpm（仓库为 pnpm workspace，存在 `pnpm-lock.yaml`） |
