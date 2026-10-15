import { builtinModules } from 'node:module';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = ({ mode }) => ({
  envDir: process.cwd(),
  build: {
    minify: false,
    // 非生产构建（dev / watch）输出 inline sourcemap，
    // 供宿主 --inspect 启动时在 VSCode 中断点调试插件主进程源码
    sourcemap: mode === 'production' ? false : 'inline',
    target: 'node20',
    outDir: './dist',
    // 本插件有三段产物（主进程 / 画面窗口 / 启动器 UI）共用 dist，
    // 任何一段单独构建都不清空目录，避免删掉其余两段产物
    emptyOutDir: false,
    lib: {
      entry: 'index.js',
      // 主进程入口默认输出 ESM（宿主经动态 import 加载并支持热重载）；
      // 入口需保持单文件 bundle：宿主的热重载以 query 击穿入口缓存，
      // 多文件 chunk 的相对依赖不会被击穿
      formats: ['es'],
      fileName: () => 'index.esm.js',
    },
    rolldownOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
});

export default config;
