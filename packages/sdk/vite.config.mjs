/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(dirname, 'src/index.js'),
        'vite-plugin': resolve(dirname, 'src/vite-plugin.js'),
        preview: resolve(dirname, 'src/preview/main.js'),
        'preview-mock': resolve(dirname, 'src/preview-mock.js'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'js' : 'cjs';
        return `${entryName}.${ext}`;
      },
    },
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
    emptyOutDir: true,
    sourcemap: true, // Useful for debugging
    minify: false, // Keep code readable for SDK
  },
});
