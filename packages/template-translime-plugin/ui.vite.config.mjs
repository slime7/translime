import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// import tailwindcss from '@tailwindcss/vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import vuetify from 'vite-plugin-vuetify';
import { getPreviewSettingsPath, translimeSdk } from 'translime-sdk/vite';

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => {
  const isPreview = mode === 'preview';

  const plugins = [
    vue(),
    // tailwindcss(), // 可选
    translimeSdk(),
  ];

  if (isPreview) {
    plugins.push(
      vuetify({
        styles: {
          configFile: getPreviewSettingsPath(),
        },
      }),
    );
  } else {
    plugins.push(
      cssInjectedByJsPlugin({
        styleId: 'translime-plugin-example',
        injectCodeFunction: function injectCodeCustomRunTimeFunction(cssCode, options) {
          try {
            if (typeof document !== 'undefined') {
              const elementStyle = document.createElement('style');
              elementStyle.id = options.styleId;

              const existingElement = document.getElementById(options.styleId);
              if (existingElement) {
                existingElement.remove();
              }
              elementStyle.appendChild(document.createTextNode(`${cssCode}`));
              document.head.appendChild(elementStyle);
            }
          } catch (e) {
            console.error('vite-plugin-css-injected-by-js', e);
          }
        },
      }),
    );
  }

  return {
    plugins,
    envDir: process.cwd(),
    build: {
      minify: false,
      sourcemap: isPreview ? 'inline' : false,
      target: 'node20',
      outDir: './dist',
      lib: {
        entry: 'ui.vue',
        name: 'translime-plugin-example', // 需要指定一个唯一 id
        formats: ['esm'], // 现在使用 esm 导入插件 ui
        fileName: (format) => `ui.${format}.js`,
        cssFileName: 'ui',
      },
      rollupOptions: {
        external: ['vue'], // 打包排除 vue 依赖并且主项目有 `importmap`，不需要设置全局变量
      },
      emptyOutDir: false,
    },
  };
});
