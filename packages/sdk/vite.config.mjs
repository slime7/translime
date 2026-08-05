/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

const dirname = fileURLToPath(new URL('.', import.meta.url));

const libEntry = {
  index: resolve(dirname, 'src/index.js'),
  'vite-plugin': resolve(dirname, 'src/vite-plugin.js'),
  preview: resolve(dirname, 'src/preview/main.js'),
  'preview-mock': resolve(dirname, 'src/preview-mock.js'),
};

const plugins = [
  vue(),
  vuetify({ autoImport: true }),
];

const fileName = (format, entryName) => {
  const ext = format === 'es' ? 'js' : 'cjs';
  return `${entryName}.${ext}`;
};

const baseBuild = {
  rolldownOptions: {
    // Externalize deps to reduce bundle size and avoid conflicts
    external: [
      'electron',
      'vue',
      'vuetify',
      'vuetify/components',
      'vuetify/directives',
      'vuetify/iconsets/md',
      'vuetify/blueprints',
      'vuetify/styles',
      'vuetify/locale',
      'fs',
      'path',
      'url',
      'events',
      'translime-sdk/preview', // self-reference in generated code
    ],
    output: {
      // Keep directory structure
      preserveModules: false,
      // SDK 的部分入口同时导出了 default 与 named，显式声明 CJS 采用 named 导出语义，
      // 可以避免构建阶段的 MIXED_EXPORTS 警告，并让输出行为更明确。
      exports: 'named',
    },
  },
  outDir: 'dist',
  sourcemap: true, // Useful for debugging
  minify: false, // Keep code readable for SDK
};

export default defineConfig(({ mode }) => {
  // ESM 与 CJS 产物分开构建（package.json 中 vite build 与 vite build --mode cjs 各一次）。
  // CJS 产物通过 define 把 import.meta.url 替换为等价表达式，
  // 避免 EMPTY_IMPORT_META 警告，同时保证两种产物都可用
  const isCjsPass = mode === 'cjs';

  return {
    plugins,
    define: isCjsPass
      ? { 'import.meta.url': 'require("url").pathToFileURL(__filename).href' }
      : undefined,
    build: {
      ...baseBuild,
      lib: {
        entry: libEntry,
        formats: [isCjsPass ? 'cjs' : 'es'],
        fileName,
      },
      emptyOutDir: !isCjsPass,
    },
  };
});
