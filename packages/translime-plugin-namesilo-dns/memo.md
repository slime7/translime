# Translime Plugin: Namesilo DNS (`translime-plugin-namesilo-dns`)

## 1. 项目概述 (Project Overview)

本插件是一个用于 **Translime** 的 Namesilo 动态 DNS (DDNS) 更新工具，支持定时检测本机公网 IP 并自动更新到 Namesilo 的 DNS 记录中。

- **插件名称**: `translime-plugin-namesilo-dns`
- **功能描述**: 定时获取公网 IP 并更新 Namesilo DNS 记录。
- **技术栈**:
    - **Frontend**: Preact, TailwindCSS, Vite
    - **Backend**: Electron (Node.js)

## 2. 目录结构说明 (Directory Structure)

```
translime-plugin-namesilo-dns/
├── src/                    # 源码 (Source code)
│   ├── ui/                 # UI 相关代码 (UI components)
│   │   ├── Ui.jsx          # 主设置界面
│   │   ├── Titlebar.jsx    # 自定义标题栏
│   │   ├── index.jsx       # UI 入口
│   │   └── ui.css          # UI 样式
│   └── index.js            # 主进程入口文件 (Main process entry)
├── package.json            # 项目配置与依赖
├── vite.config.js          # 主进程构建配置
├── ui.vite.config.js       # UI 构建配置
├── tailwind.config.js      # TailwindCSS 配置
└── postcss.config.js       # PostCSS 配置
```

## 3. 开发规范 (Development Guidelines)

### 3.1 环境隔离 (Environment Isolation)

*   **主进程 (Main Process)**
    *   **入口文件**: `src/index.js`
    *   **职责**: 处理定时任务、DNS 查询与更新、日志记录、IPC 消息处理。
    *   **可用 API**: `mainStore`, `appManager`, `axios` (Node.js adapter)。

*   **渲染进程 (Renderer Process)**
    *   **入口文件**: `src/ui/index.jsx`
    *   **框架**: Preact + TailwindCSS。
    *   **职责**: 提供用户配置界面 (API Key, 域名, IP 类型等)。

### 3.2 IPC 通信 (IPC Communication)

*   **IPC 处理**: 在 `src/index.js` 的 `ipcHandlers` 中定义。
*   **支持事件**:
    *   `start`: 启动定时任务。
    *   `stop`: 停止定时任务。
    *   `isRunning`: 检查任务状态并获取日志。

### 3.3 核心流程 (Core Workflow)

1.  **启动**: 用户开启 "启动 app 时自动运行" 或手动点击启动 -> 调用 `start()`。
2.  **循环**: `intervalCall` 触发，默认间隔 30 分钟，每轮执行时实时读取最新配置。
3.  **检测**: `main()` 函数按配置检查 IPv4/IPv6，并在当前轮执行完成后再调度下一轮。
    *   `getIp()`: 获取当前公网 IP。
    *   `getRecord()`: 获取 Namesilo 当前 DNS 记录。
4.  **更新**: 若 IP 不一致，调用 `setRecord()` 更新 DNS 记录。
5.  **日志**: 通过 `pushLog` 记录操作结果并推送到前端显示。

## 4. 特别注意事项 (Special Notes)

*   **文档同步**: 每次完成新功能或修改核心逻辑后，**必须同步更新本文件 (`memo.md`)**，以保持项目的一致性与可维护性。
*   **构建**: 使用 `pnpm build` 同时构建插件主进程和 UI。
*   **网络适配**: 使用 `axios/unsafe/adapters/http.js` 确保在 Electron Node 环境下正确发送请求。
*   **配置存储**: 依赖 `global.store` (v0.2) 或 `mainStore.config` (v0.3) 存储用户设置。
*   **循环控制**: 使用 `isRunning + setTimeout` 控制任务生命周期，避免重复启动并确保停止后不再调度新任务。
