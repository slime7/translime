/* eslint-env node */

import { join } from 'path';
import { builtinModules } from 'module';
import { createVuePlugin } from 'vite-plugin-vue2';
import viteComponents, {
  VuetifyResolver,
} from 'vite-plugin-components';
import { chrome } from '../electron-vendors.config.json';

const RENDERER_ROOT = join(__dirname, 'renderer');

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
        find: '@pkg/',
        replacement: `${join(RENDERER_ROOT, '..')}/`,
      },
      {
        find: '@/',
        replacement: `${join(RENDERER_ROOT)}/`,
      },
    ],
  },
  plugins: [
    createVuePlugin(),
    viteComponents({
      customComponentResolvers: [
        VuetifyResolver(),
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
    sourcemap: true,
    target: `chrome${chrome}`,
    rollupOptions: {
      external: [
        ...builtinModules,
      ],
    },
  },
};

export default config;
