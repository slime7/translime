利用 link 命令添加本地测试包的简要步骤：

1. 在要测试的包的根目录中运行`yarn link`或`pnpm link`命令，它会将该包链接到全局 yarn 目录中。

2. 在项目主目录的`plugins_dev`目录下，运行`yarn link <包名>`命令，它会将该包链接到 node_modules 目录下。

3. 打开程序，在设置中开启‘显示开发中插件’。

注意，使用 yarn link 命令链接的包仅适用于本地测试和开发目的。一旦测试完成，需要通过 yarn unlink 命令来断开链接。
