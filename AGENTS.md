# Agent Instructions

## 项目说明

translime 是一个基于 Electron 的小功能加载器，用于快速加载以插件形式打包的 Node.js 程序。仓库为 pnpm workspace 结构：`packages/app` 是宿主应用，`packages/sdk` 是插件开发 SDK，`packages` 下以 `translime-plugin-` 开头的目录是插件。

## 开始任务前必须阅读

- [docs/VISION.md](docs/VISION.md) — 项目目标、用户与边界
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 系统组成、数据流与部署
- [docs/ABSTRACTIONS.md](docs/ABSTRACTIONS.md) — 插件、manifest、状态机等核心概念
- [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) — 环境要求、命令与常见任务
- 涉及插件开发时，必须阅读 [.agents/rules/plugin-development.md](.agents/rules/plugin-development.md) 与 [packages/template-translime-plugin/readme.md](packages/template-translime-plugin/readme.md)；SDK 接口以 [packages/sdk/README.md](packages/sdk/README.md) 为准

## 开发流程

- 仓库默认分支为 `dev`，新功能按仓库现有实践在 `feature/*` 分支开发。

## 插件创建规则

在仓库中创建新的插件包时：

1. 包名必须以 `translime-plugin-` 开头。
2. 使用共享脚手架 `.agents/plugin-scaffold/`。
3. 在仓库根目录运行 `node .agents/plugin-scaffold/create-plugin.mjs --name translime-plugin-your-name`。
4. 默认模板为 `packages/template-translime-plugin`。
5. 脚手架完成后，确认模板占位符已被替换，并在环境允许时运行一次包构建。
6. 首个可用版本默认 `1.0.0`，除非用户明确要求延续已有版本线。
7. 插件若包含 web UI，尽早提供可用的预览/调试路径；`preview:ui` 至少要渲染有意义的 mock 数据与可交互状态，而不是空的 IPC 桩。
8. 插件若有非平凡逻辑，把功能模块拆分为可单独测试的文件，并添加包级测试脚本。
9. 若用户要求原生绑定、覆盖窗口或更复杂的构建流程，先阅读 `.agents/plugin-scaffold/plugin-variants.md`，并有选择地参考 `translime-plugin-steam-save-backup` 或 `translime-plugin-hdr-capture` 等近期插件包。

## 编码与项目专用规则

- 环境隔离：插件主进程代码使用 `getMainStore()`、`usePluginConfig()`、`usePluginInterop()`；插件渲染进程代码使用 `useIpc()`、`getPluginSetting()`、`setPluginSetting()`、`useWindowControl()` 等 UI API，禁止跨环境调用。
- IPC 命名：所有 `ipc.invoke` 事件必须遵循 `事件名@插件ID` 格式。
- 图标：使用 Material Design Icons（md）风格，禁止 `mdi-` 前缀，例如 `<v-icon icon="home" />`。
- 样式隔离：插件样式不得污染宿主。宿主启用了 Vuetify 与 Tailwind，插件使用 Tailwind 时必须采用 `@layer` 降权、prefix 或禁用 preflight 等方式隔离。
- 插件 UI 渲染在隔离的 `<webview>` 或独立 BrowserWindow 中运行，宿主会缓存 webview 实例，路由切换时只切换显示状态。
- `main-renderer-ready` 只允许主窗口首屏渲染完成后触发，插件渲染页不得重复触发宿主启动初始化逻辑。
- 修改宿主主进程逻辑时，同步更新 `src/main/core/ipcHandler.js` 与 `src/share/utils/ipcConstant.js` 中的对应事件。

## 测试规则

1. 只测试用户可观察的行为、业务规则和公开接口。
2. 不测试 CSS 类名、Tailwind 工具类、组件内部状态、私有方法或具体 DOM 层级。
3. 除非样式类本身就是明确的产品契约，否则禁止断言 `classes()`。
4. 纯视觉调整默认不新增单元测试，建议使用视觉回归测试。
5. 优先覆盖：
   - 条件分支
   - 用户交互结果
   - 错误和边界情况
   - 权限和状态变化
   - 事件、请求及副作用
   - 可访问性
6. 每个测试必须说明它防止什么真实回归。
7. 如果需求没有引入可测试的行为变化，请明确回答“不需要新增单元测试”。
8. 测试应能承受重构：修改样式、内部组件拆分或变量名后不应失败。
9. 不要为了提高覆盖率编写无业务意义的测试。
10. 编写代码前，先列出候选用例及测试价值，过滤低价值用例。

## 命令

- 安装依赖：`pnpm install`（仓库含 git submodule，先执行 `git submodule update --init`）
- 启动宿主开发：`pnpm dev`
- 构建宿主：`pnpm build:app`
- 宿主测试：`pnpm -C packages/app run test`
- SDK 构建：`pnpm -C packages/sdk run build`
- 插件构建：`pnpm --filter <插件包名> run build`
- 包级 lint：`pnpm -C packages/app run lint`、`pnpm -C packages/sdk run lint`，插件按其 `package.json` 中的 lint 脚本执行
- 发布插件包：`pnpm run publish:package -- --name <插件包名>`

## 安全与数据限制

- 本地私有目录已通过 `.gitignore` 排除（如 `/agent_temp` 与未入库的插件目录），不得将其纳入版本控制。
- 插件运行在独立沙箱中，宿主与插件通过 IPC 通信；插件代码不得直接访问宿主进程内部状态。
- 运行期日志与用户数据位于 Electron `userData` 目录，不得提交到仓库。

## 文档维护触发条件

- 产品目标、受众或非目标变化 → 更新 `docs/VISION.md`
- 模块边界、数据流、依赖或部署变化 → 更新 `docs/ARCHITECTURE.md`，必要时在 `docs/adr/` 记录决策
- 领域模型、公共类型、状态或命名约定变化 → 更新 `docs/ABSTRACTIONS.md`，必要时在 `docs/adr/` 记录决策
- 环境要求、命令、目录或常见操作变化 → 更新 `docs/GETTING-STARTED.md`
- 长期架构选择及其取舍 → 使用 `.agents/adr/create_adr.py` 创建 ADR（用法与格式见 `docs/adr/README.md`）
