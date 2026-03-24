/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.js'),
        'vite-plugin': resolve(__dirname, 'src/vite-plugin.js'),
        preview: resolve(__dirname, 'src/preview/main.js'),
        'preview-mock': resolve(__dirname, 'src/preview-mock.js'),
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
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true, // Useful for debugging
    minify: false, // Keep code readable for SDK
  },
});
