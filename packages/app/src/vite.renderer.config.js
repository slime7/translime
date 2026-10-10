/* eslint-env node */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig, normalizePath } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import vuetify from 'vite-plugin-vuetify';
import { viteStaticCopy } from 'vite-plugin-static-copy';
// eslint-disable-next-line import-x/extensions
import { buildStandaloneMdeBundle } from './main/utils/mdeBundleHelper.js';

const RENDERER_ROOT = join(import.meta.dirname, 'renderer');
const MODULES_ROOT = join(import.meta.dirname, '../node_modules');
const SHARED_VUE_SOURCE = normalizePath(resolve(MODULES_ROOT, './vue/dist/vue.esm-browser.js'));
const SHARED_VUE_DEV_URL = '/libs/vue/vue.esm-browser.js';
const DEFAULT_VITE_ORIGIN = 'http://localhost:5173/';
const SHARED_VUE_IMPORT_PATH = './libs/vue/vue.esm-browser.js';

const SHARED_MDE_CSS_SOURCE = normalizePath(resolve(MODULES_ROOT, './mde-vue/dist/styles.css'));
const SHARED_MDE_TAILWIND_SOURCE = normalizePath(resolve(MODULES_ROOT, './mde-vue/dist/tailwind.css'));
const SHARED_MDE_BOOTSTRAP_SOURCE = normalizePath(resolve(RENDERER_ROOT, './libs/mde/bootstrap.js'));

const createSharedVueImportMapPlugin = (isDev, mdeStandaloneSource) => {
  let sharedVueDevUrl = new URL(SHARED_VUE_DEV_URL, DEFAULT_VITE_ORIGIN).href;

  const updateSharedDevUrls = (server) => {
    const resolvedUrl = server.resolvedUrls?.local?.[0];
    const { host, port } = server.config.server;
    const fallbackHost = host === true || host === '0.0.0.0' ? 'localhost' : host || 'localhost';
    const baseUrl = resolvedUrl || `http://${fallbackHost}:${port || 5173}/`;
    sharedVueDevUrl = new URL(SHARED_VUE_DEV_URL, baseUrl).href;
  };

  const devRoutes = {
    '/libs/mde/mde.esm.js': { source: mdeStandaloneSource, type: 'text/javascript; charset=utf-8' },
    '/libs/mde/mde.css': { source: SHARED_MDE_CSS_SOURCE, type: 'text/css; charset=utf-8' },
    '/libs/mde/mde-tailwind.css': { source: SHARED_MDE_TAILWIND_SOURCE, type: 'text/css; charset=utf-8' },
    '/libs/mde/bootstrap.js': { source: SHARED_MDE_BOOTSTRAP_SOURCE, type: 'text/javascript; charset=utf-8' },
  };

  return {
    name: 'translime-shared-vue-import-map',
    enforce: 'pre',
    resolveId(source) {
      if (!isDev) {
        return null;
      }
      if (source === 'vue') {
        return {
          id: sharedVueDevUrl,
          external: true,
        };
      }
      return null;
    },
    configureServer(server) {
      if (!isDev) {
        return;
      }

      updateSharedDevUrls(server);
      server.httpServer?.once('listening', () => {
        updateSharedDevUrls(server);
      });
      server.middlewares.use((request, response, next) => {
        const requestPath = request.url?.split('?')[0];
        if (requestPath === SHARED_VUE_DEV_URL) {
          response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
          response.end(readFileSync(SHARED_VUE_SOURCE));
          return;
        }

        const mdeRoute = devRoutes[requestPath];
        if (mdeRoute) {
          response.writeHead(200, { 'Content-Type': mdeRoute.type });
          response.end(readFileSync(mdeRoute.source));
          return;
        }

        next();
      });
    },
    transformIndexHtml(html) {
      if (!isDev) {
        return html;
      }

      return html.replace(SHARED_VUE_IMPORT_PATH, sharedVueDevUrl);
    },
  };
};

/**
 * @see https://vitejs.dev/config/
 */
export default defineConfig(async ({ mode }) => {
  const isDev = mode === 'development';
  const isProd = mode === 'production';
  const sharedMdeStandaloneSource = normalizePath(await buildStandaloneMdeBundle());
  return {
    mode,
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
        ...(isProd ? [{
          find: /^vue$/,
          replacement: 'app://./libs/vue/vue.esm-browser.js',
        }] : []),
      ],
    },
    plugins: [
      /* 使插件和本体都能使用同一个 vue 与 mde 实例，构建后放入 libs 目录为两者提供引用 */
      viteStaticCopy({
        targets: [
          {
            src: normalizePath(resolve(MODULES_ROOT, `./vue/dist/vue.esm-browser${isProd ? '.prod' : ''}.js`)),
            dest: 'libs/vue',
            rename: 'vue.esm-browser.js',
          },
          {
            src: sharedMdeStandaloneSource,
            dest: 'libs/mde',
            rename: 'mde.esm.js',
          },
          {
            src: SHARED_MDE_CSS_SOURCE,
            dest: 'libs/mde',
            rename: 'mde.css',
          },
          {
            src: SHARED_MDE_TAILWIND_SOURCE,
            dest: 'libs/mde',
            rename: 'mde-tailwind.css',
          },
          {
            src: SHARED_MDE_BOOTSTRAP_SOURCE,
            dest: 'libs/mde',
            rename: 'bootstrap.js',
          },
        ],
      }),
      createSharedVueImportMapPlugin(isDev, sharedMdeStandaloneSource),
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'webview',
          },
        },
      }),
      tailwindcss(),
      vuetify(),
    ],
    optimizeDeps: {
      exclude: [
        'vue',
        'vuetify',
        'mde-vue',
        'vue-router',
      ],
    },
    base: '',
    server: {
      fs: {
        strict: true,
      },
    },
    build: {
      outDir: join(RENDERER_ROOT, '../../dist/renderer'),
      emptyOutDir: true,
      minify: false,
      sourcemap: isDev ? 'inline' : false,
      target: 'chrome134',
      rolldownOptions: {
        input: {
          main: join(RENDERER_ROOT, 'index.html'),
        },
        external: [
          'vue',
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
        ],
      },
    },
  };
});
