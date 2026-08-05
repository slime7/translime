import { builtinModules } from 'node:module';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = ({ mode }) => ({
  envDir: process.cwd(),
  define: {
    // 插件主进程产物为 CJS，把 import.meta.url 替换为等价表达式，
    // 避免 EMPTY_IMPORT_META 警告（源码保持 ESM 写法）
    'import.meta.url': 'require("node:url").pathToFileURL(__filename).href',
  },
  build: {
    minify: false,
    sourcemap: mode === 'development' ? 'inline' : false,
    target: 'node20',
    outDir: './dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/main.js',
      name: 'plugin',
      formats: ['cjs'],
      fileName: (format) => `main.${format}.js`,
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
