import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import vuetify from 'vite-plugin-vuetify';
import * as translimeVite from 'translime-sdk/vite';

const {
  createPluginCssIsolationPlugins,
  getPreviewSettingsPath,
  translimeSdk,
} = translimeVite;

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
export default defineConfig(({ mode }) => {
  const isPreview = mode === 'preview';

  // 基础插件
  const plugins = [
    vue(),
    tailwindcss(),
    translimeSdk(),
  ];

  // preview 模式下添加 vuetify 插件来正确处理样式
  if (isPreview) {
    plugins.push(
      vuetify({
        styles: {
          configFile: getPreviewSettingsPath(),
        },
      }),
    );
  }

  // 非 preview 模式下添加 CSS 注入插件
  if (!isPreview) {
    plugins.push(
      ...createPluginCssIsolationPlugins('translime-plugin-hdr-capture'),
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
        entry: 'src/ui/ui.vue',
        name: 'translime-plugin-hdr-capture',
        formats: ['esm'],
        fileName: (format) => `ui.${format}.js`,
        cssFileName: 'ui',
      },
      rolldownOptions: {
        external: ['vue'],
      },
      emptyOutDir: false,
    },
  };
});
