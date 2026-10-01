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
    // watch 模式下 UI 构建会并行写入同一个 dist，清空会删掉对方产物
    emptyOutDir: mode !== 'watch',
    lib: {
      entry: 'index.js',
      name: 'plugin',
      formats: ['cjs'],
      fileName: (format) => `index.${format}.js`,
    },
    rolldownOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
});

export default config;
