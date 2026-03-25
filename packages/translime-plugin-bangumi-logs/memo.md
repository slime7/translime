# Translime Plugin Memo: Bangumi Logs (`translime-plugin-bangumi-logs`)

## 概要

这是一个基于手动 Access Token 登录的 Bangumi 追番插件。

主要能力：

- 校验并保存用户填写的 Bangumi personal access token
- 拉取当前用户动画收藏列表，默认展示“在看”
- 搜索动画并加入收藏
- 查看分集进度
- 标记单集已看
- 快速更新“看到这里”

当前版本号从 `1.0.0` 起。

## 目录结构

```txt
packages/translime-plugin-bangumi-logs/
├─ index.js                     # 插件主进程入口转发到 src/main/index.js
├─ ui.vue                       # 插件 UI 入口转发到 src/ui/App.vue
├─ package.json                 # 包信息、构建脚本、测试脚本
├─ vite.config.js               # 主进程构建配置
├─ ui.vite.config.mjs           # UI 构建与 preview 配置
├─ vitest.config.js             # 插件单测配置
├─ readme.md                    # 插件开发说明
├─ memo.md                      # 本文档
├─ src/
│  ├─ main/
│  │  ├─ index.js               # 主进程导出，注册 ipcHandlers
│  │  ├─ handlers.js            # 业务 IPC 入口
│  │  ├─ bangumiApi.js          # Bangumi API 封装
│  │  ├─ request.js             # fetch 请求与错误处理
│  │  └─ config.js              # 插件 token / UI 偏好设置读写
│  ├─ shared/
│  │  ├─ constants.js           # 插件常量、收藏状态枚举
│  │  ├─ errors.js              # BangumiApiError 与错误文案映射
│  │  └─ transformers.js        # 数据转换、进度计算、请求载荷辅助
│  └─ ui/
│     ├─ App.vue                # 主界面，登录页 + 工作台
│     ├─ useBangumiLogs.js      # UI 状态与交互编排
│     └─ previewData.js         # preview:ui 用的本地 mock 数据与假接口
└─ tests/
   ├─ main/request.test.js      # 请求层与错误映射测试
   └─ shared/transformers.test.js
                                # 数据转换与进度逻辑测试
```

## API 规范说明

本插件对 Bangumi API 的调用与数据模型解析，均以项目根目录下的本地文档为准：

- **文档位置**: `docs/api/`
- **核心定义**: `docs/api/open-api/v0.yaml` (OpenAPI 3.0 规范)
- **数据结构**: 分集 (Episode/EpisodeDetail) 的 `airdate` 字段用于判断放送状态。

## 运行逻辑

主进程和 UI 分离。

主进程：

- `index.js` 只负责导出 `pluginDidLoad`、`pluginWillUnload` 和 `ipcHandlers`
- `handlers.js` 定义插件对外可调用的 IPC：
  - `auth-status`
  - `auth-verify`
  - `auth-logout`
  - `dashboard-load`
  - `search-subjects`
  - `collect-subject`
  - `get-subject-episodes`
  - `update-episode-state`
  - `update-progress-to-episode`
- `config.js` 通过 `usePluginConfig()` 读写 token 和 UI 偏好
- `bangumiApi.js` 统一调用 Bangumi `/v0/*` 接口
- `request.js` 负责请求头、query 拼接、JSON 解析和错误抛出

UI：

- `App.vue` 只负责界面展示和事件绑定
- `useBangumiLogs.js` 负责页面状态、登录流程、列表刷新、搜索和进度操作
- UI 启动时先调用 `auth-status`
- 已登录则继续调用 `dashboard-load`
- 选中条目后调用 `get-subject-episodes`
- 单集已看调用 `update-episode-state`
- “看到这里”先读取当前分集，再通过 `update-progress-to-episode` 批量更新

preview 模式：

- `preview:ui` 下使用 `translime-sdk` 的 preview 环境
- `useBangumiLogs.js` 检测 `isPreviewMode()` 后，不走真实 IPC
- preview 调用转发到 `previewData.js`
- `previewData.js` 提供假登录状态、假收藏列表、假搜索结果、假分集数据，便于直接调试 UI

## 数据约定

登录方式：

- 不使用 OAuth
- 用户手动在 Bangumi 页面生成 personal access token
- token 保存在插件设置中，当前没有额外加密

业务范围：

- 只处理动画条目
- 收藏状态使用 Bangumi 的 `1-5` 枚举
- 分集已看状态使用 Bangumi 的 `2`
- “看到这里”只对主线分集生效

## 开发与验证

常用脚本：

- `pnpm --filter translime-plugin-bangumi-logs build`
- `pnpm --filter translime-plugin-bangumi-logs test`
- `pnpm --filter translime-plugin-bangumi-logs preview:ui`

修改规则：

- 如果目录结构、IPC 名称、核心运行逻辑、登录方式、测试入口或 preview 方案发生变化，必须同步更新这份 `memo.md`
