# 插件本地开发测试指南

利用 link 命令添加本地测试包的简要步骤：

> **注意**: 请统一使用同一种包管理器（yarn 或 pnpm），避免混用。

## 方式一：通过全局链接

1. 在要测试的插件包根目录中运行 `yarn link` 或 `pnpm link --global` 命令，将该包链接到全局目录。

2. 在项目主目录的 `plugins_dev` 目录下，运行 `yarn link <包名>` 或 `pnpm link --global <包名>` 命令，将全局包链接到本地。

## 方式二：直接链接本地路径（推荐）

在项目主目录的 `plugins_dev` 目录下运行：

```bash
pnpm link <path/to/package>
```

## 启用开发插件

打开程序，在设置中开启 **"显示开发中插件"** 选项。

## 清理链接

测试完成后，需要断开链接：

- yarn 用户：`yarn unlink <包名>`
- pnpm 用户：`pnpm unlink <包名>`
