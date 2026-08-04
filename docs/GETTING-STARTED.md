# GETTING STARTED

## 前置环境

- Node.js ≥ 18.20（`packages/app` 的 engines 要求）。
- pnpm 10（仓库为 pnpm workspace，锁文件为 `pnpm-lock.yaml`）。
- 宿主当前以 Windows 为主要开发与发布平台（CI 仅运行 windows-latest，打包目标为 Windows x64）。
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

## 构建、测试与检查

- 构建宿主：`pnpm build:app`（产物在 `packages/app/dist`；electron-builder 打包输出在 `packages/app/dist_electron`）
- 宿主测试：`pnpm -C packages/app run test`（vitest）
- 宿主 lint：`pnpm -C packages/app run lint`
- 构建 SDK：`pnpm -C packages/sdk run build`（产物在 `packages/sdk/dist`，含类型声明）
- SDK lint：`pnpm -C packages/sdk run lint` 与 `pnpm -C packages/sdk run lint:style`
- 构建插件：`pnpm --filter <插件包名> run build`
- 插件测试：`pnpm --filter translime-plugin-bangumi-logs run test`、`pnpm --filter translime-plugin-hdr-capture run test`
- 发布插件包：`pnpm run publish:package -- --name <插件包名>`（CI 通过 tag `translime-*@*.*.*` 或手动触发执行同一脚本）

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

### 创建新插件

```text
node .agents/plugin-scaffold/create-plugin.mjs --name translime-plugin-your-name
```

可选参数：`--title`、`--description`、`--template`、`--repo`、`--force`。默认模板为 `packages/template-translime-plugin`，首个可用版本默认 `1.0.0`。

### 在宿主中联调插件

1. 在插件包内构建插件（`pnpm --filter <插件包名> run build`）。
2. 把插件链接到宿主的开发插件目录 `<userData>/plugins_dev/node_modules`：在插件根目录执行 `pnpm link --global`，再在 `plugins_dev/node_modules` 目录执行 `pnpm link --global <包名>`；或在 `plugins_dev/node_modules` 目录直接执行 `pnpm link <插件包绝对路径>`。
3. 在宿主设置中开启"显示开发中插件"，进入插件页面启用并验证。
4. 重新构建后使用插件卡片上的重载入口刷新。

### 调试插件 UI（preview 模式）

部分插件提供 `preview:ui` 脚本（如 `pnpm --filter translime-plugin-example run preview:ui`），在普通浏览器中运行 SDK 提供的 preview shell，mock 宿主 API。涉及布局、主题、窗口模式与宿主集成行为时，以宿主内效果为准。

## 常见故障

| 现象 | 处理 |
| --- | --- |
| 插件卡片显示 `build-missing` | 插件未构建或产物缺失，运行该插件的 build 脚本 |
| 插件卡片显示 `blocked` | 插件声明的依赖插件未启用，先启用依赖 |
| `bangumi-logs/docs/api` 目录为空 | submodule 未初始化，执行 `git submodule update --init` |
| `hdr-capture` 构建失败 | 缺少 Rust 工具链或 napi 依赖 |
| 修改插件 UI 后宿主内无变化 | webview 实例被缓存，使用插件卡片重载入口刷新 |
| 安装依赖报错 | 统一使用 pnpm（仓库为 pnpm workspace，存在 `pnpm-lock.yaml`） |
