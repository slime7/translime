/* eslint-env node */

import { join, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { normalizePath } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const RENDERER_ROOT = join(__dirname, 'renderer');
const MODULES_ROOT = join(__dirname, '../node_modules');
const isProd = process.env.MODE === 'production';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  mode: process.env.MODE,
  root: RENDERER_ROOT,
  resolve: {
    alias: [
      {
        find: /^@pkg\/(.*)/,
        replacement: `${join(RENDERER_ROOT, '..')}/$1`,
      },
      {
        find: /^@\/(.*)/,
        replacement: `${join(RENDERER_ROOT)}/$1`,
      },
      {
        find: /^vue$/,
        replacement: isProd ? 'app://./libs/vue/vue.esm-browser.js' : 'http://localhost:5173/libs/vue/vue.esm-browser.js',
      },
    ],
  },
  plugins: [
    vue(),
    vuetify(),
    /* 使插件和本体都能使用同一个 vue 实例，将 vue 在构建后放入根目录为两者提供引用 */
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(resolve(MODULES_ROOT, `./vue/dist/vue.esm-browser${isProd ? '.prod' : ''}.js`)),
          dest: 'libs/vue',
          rename: 'vue.esm-browser.js',
        },
      ],
    }),
  ],
  base: '',
  server: {
    fs: {
      strict: true,
    },
  },
  css: {
    preprocessorOptions: {
      sass: {
        additionalData: [
          // vuetify variable overrides
          '@import "@/assets/styles/variables"',
          '',
        ].join('\n'),
      },
    },
  },
  build: {
    outDir: join(RENDERER_ROOT, '../../dist/renderer'),
    emptyOutDir: true,
    minify: false,
    commonjsOptions: {},
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    target: 'modules',
    rollupOptions: {
      input: {
        main: join(RENDERER_ROOT, 'index.html'),
        pluginIndex: join(RENDERER_ROOT, 'plugin-index.html'),
      },
      external: [
        'vue',
        ...builtinModules,
      ],
    },
  },
};

export default config;
