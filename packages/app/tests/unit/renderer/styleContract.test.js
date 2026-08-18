import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

const appRoot = resolve(testDir, '../../..');
const sdkRoot = resolve(appRoot, '../sdk');

const read = (relativePath) => readFile(resolve(appRoot, relativePath), 'utf8');
const readSdk = (relativePath) => readFile(resolve(sdkRoot, relativePath), 'utf8');

const listFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => listFiles(resolve(dir, entry.name))),
  );
  return [
    ...nested.flat(),
    ...entries
      .filter((entry) => entry.isFile())
      .map((entry) => resolve(dir, entry.name)),
  ];
};

describe('宿主 Vuetify + Tailwind 样式契约', () => {
  describe('CSS layer 顺序（官方文档结构）', () => {
    const officialOrder = [
      'tailwind-theme',
      'tailwind-reset',
      'vuetify-core',
      'vuetify-components',
      'vuetify-overrides',
      'vuetify-utilities',
      'tailwind-utilities',
      'vuetify-final',
    ];

    it('layers.css 以官方顺序声明全部 layer', async () => {
      const css = await read('src/renderer/assets/styles/layers.css');
      const positions = officialOrder.map((name) => css.indexOf(`@layer ${name};`));

      positions.forEach((pos, index) => {
        expect(pos, `缺少 @layer ${officialOrder[index]}; 声明`).toBeGreaterThan(-1);
        if (index > 0) {
          expect(pos, `${officialOrder[index]} 应排在 ${officialOrder[index - 1]} 之后`).toBeGreaterThan(positions[index - 1]);
        }
      });
    });

    it('vuetify.js 在 vuetify/styles 之前导入 layers.css', async () => {
      const js = await read('src/renderer/plugins/vuetify.js');
      const layersImport = js.indexOf('assets/styles/layers.css');
      const stylesImport = js.indexOf("import 'vuetify/styles'");

      expect(layersImport).toBeGreaterThan(-1);
      expect(stylesImport).toBeGreaterThan(layersImport);
    });

    it('app.css 不再声明旧的 tailwind 中间层顺序', async () => {
      const css = await read('src/renderer/assets/styles/app.css');
      expect(css).not.toContain('vuetify-overrides, tailwind');
    });
  });

  describe('tailwind.css 配置', () => {
    it('按官方方式导入 theme 与 utilities 到对应 layer，且不引入 preflight', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('@import "tailwindcss/theme" layer(tailwind-theme);');
      expect(css).toContain('@import "tailwindcss/utilities" layer(tailwind-utilities);');
      expect(css).not.toContain('tailwindcss/base');
      expect(css).not.toContain('tailwindcss/preflight');
      expect(css).not.toMatch(/@import\s+["']tailwindcss["']/);
    });

    it('dark/light 变体绑定 Vuetify 主题类', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('@custom-variant light (&:where(.v-theme--light, .v-theme--light *));');
      expect(css).toContain('@custom-variant dark (&:where(.v-theme--dark, .v-theme--dark *));');
    });

    it('断点与 Vuetify 阈值对齐（0/600/960/1280/1920/2560，xxl 命名）', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('--breakpoint-*: initial;');
      expect(css).toMatch(/--breakpoint-xs:\s+0px;/);
      expect(css).toMatch(/--breakpoint-sm:\s+600px;/);
      expect(css).toMatch(/--breakpoint-md:\s+960px;/);
      expect(css).toMatch(/--breakpoint-lg:\s+1280px;/);
      expect(css).toMatch(/--breakpoint-xl:\s+1920px;/);
      expect(css).toMatch(/--breakpoint-xxl:\s+2560px;/);
    });

    it('映射 Vuetify 主题色为 Tailwind 颜色', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');
      const colors = [
        'background',
        'surface',
        'surface-variant',
        'primary',
        'success',
        'warning',
        'error',
        'info',
        'on-primary-container',
        'on-secondary-container',
      ];

      colors.forEach((name) => {
        const pattern = new RegExp(`--color-${name}:\\s+rgb\\(var\\(--v-theme-${name}\\)\\);`);
        expect(css, `缺少 --color-${name} 映射`).toMatch(pattern);
      });
    });

    it('保留 Vuetify rounded 与 MD3 排版工具类的 Tailwind 等价物', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('@utility rounded-pill');
      expect(css).toContain('@utility rounded-circle');
      expect(css).toContain('@utility rounded-shaped');
      expect(css).toContain('@utility text-body-large');
      expect(css).toContain('@utility text-body-small');
    });
  });

  describe('构建与 Vuetify 配置', () => {
    it('vite 插件中 tailwindcss() 注册在 vuetify() 之前', async () => {
      const js = await read('src/vite.renderer.config.js');
      const tailwindIndex = js.indexOf('tailwindcss(),');
      const vuetifyIndex = js.indexOf('vuetify(),');

      expect(tailwindIndex).toBeGreaterThan(-1);
      expect(vuetifyIndex).toBeGreaterThan(tailwindIndex);
    });

    it('vite 渲染配置不再使用 styles.configFile 与 preprocessorOptions', async () => {
      const js = await read('src/vite.renderer.config.js');

      expect(js).not.toContain('configFile');
      expect(js).not.toContain('preprocessorOptions');
      expect(js).not.toContain('settings.scss');
      expect(js).toContain('vuetify(),');
    });

    it('vuetify.js 保留运行时主题工具类并显式对齐 display 阈值', async () => {
      const js = await read('src/renderer/plugins/vuetify.js');

      expect(js).not.toContain('utilities: false');
      expect(js).toContain("mobileBreakpoint: 'md'");
      expect(js).toContain('xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920, xxl: 2560');
    });

    it('开发模式应让宿主和插件使用同一个 Vue URL', async () => {
      const config = await read('src/vite.renderer.config.js');
      const html = await read('src/renderer/index.html');

      expect(config).toContain('createSharedVueImportMapPlugin');
      expect(config).toContain('SHARED_VUE_DEV_URL');
      expect(config).toContain('resolveId(source)');
      expect(config).toContain('server.middlewares.use');
      expect(config).toContain('server.resolvedUrls');
      expect(config).toContain('external: true');
      expect(config).toMatch(/exclude:\s*\[[\s\S]*'vue',[\s\S]*'vuetify'/);
      expect(html).toContain('"vue": "./libs/vue/vue.esm-browser.js"');
    });
  });

  describe('组件类迁移（Tailwind 为主）', () => {
    it('NaviLink.vue 使用 Tailwind 等价类', async () => {
      const vue = await read('src/renderer/views/Layout/components/NaviLink.vue');

      expect(vue).not.toContain('d-block');
      expect(vue).not.toContain('text-decoration-none');
      expect(vue).not.toContain('text-no-wrap');
      expect(vue).not.toContain('text-truncate');
      expect(vue).not.toContain('text-on-primary-container');
      expect(vue).not.toContain('text-on-secondary-container');
      expect(vue).toContain("'on-primary-container'");
      expect(vue).toContain("'on-secondary-container'");
    });

    it('Home.vue 使用 xxl 断点前缀', async () => {
      const vue = await read('src/renderer/views/Home.vue');

      expect(vue).toContain('xxl:grid-cols-4');
      expect(vue).not.toContain('2xl:grid-cols-4');
    });

    it('组件内不再残留 Tailwind 旧默认断点（64rem）', async () => {
      const logViewer = await read('src/renderer/views/LogViewer.vue');

      expect(logViewer).not.toContain('width >= 64rem');
    });
  });

  describe('原生 CSS 嵌套契约', () => {
    it('Navigation.vue 的 :deep 保持顶层写法，不嵌在原生嵌套中', async () => {
      const vue = await read('src/renderer/views/Layout/components/Navigation.vue');

      expect(vue).toContain('.navi-panel :deep(.navi-btn) {');
      expect(vue).toContain('.navi-panel :deep(.navi-btn) + .navi-btn {');
      expect(vue).not.toMatch(/\{[^}]*:deep\(/s);
    });
  });

  describe('SDK preview 同步', () => {
    it('preview layers.css 使用官方 layer 顺序', async () => {
      const css = await readSdk('src/preview/layers.css');

      expect(css).toContain('@layer tailwind-theme;');
      expect(css).toContain('@layer tailwind-utilities;');
      const themeIndex = css.indexOf('@layer tailwind-theme;');
      const utilitiesIndex = css.indexOf('@layer tailwind-utilities;');
      const vuetifyUtilitiesIndex = css.indexOf('@layer vuetify-utilities;');
      const finalIndex = css.indexOf('@layer vuetify-final;');

      expect(utilitiesIndex).toBeGreaterThan(vuetifyUtilitiesIndex);
      expect(finalIndex).toBeGreaterThan(utilitiesIndex);
      expect(themeIndex).toBeLessThan(vuetifyUtilitiesIndex);
    });

    it('preview 使用预编译 vuetify/styles，不再依赖 settings.scss', async () => {
      const main = await readSdk('src/preview/main.js');
      const plugin = await readSdk('src/vite-plugin.js');

      expect(main).toContain("import 'vuetify/styles'");
      expect(main).not.toContain('settings.scss');
      expect(plugin).not.toContain('getPreviewSettingsPath');
      expect(plugin).not.toContain('preprocessorOptions');
      expect(plugin).not.toContain('settings.scss');
    });

    it('preview App.vue 恢复原 Vuetify 工具类写法', async () => {
      const vue = await readSdk('src/preview/App.vue');

      expect(vue).toContain('d-flex');
      expect(vue).toContain('text-medium-emphasis');
      expect(vue).toContain('text-body-small');
    });
  });

  describe('Sass 移除守卫', () => {
    it('app 与 sdk 源码目录不存在 .scss/.sass 文件', async () => {
      const files = [
        ...await listFiles(resolve(appRoot, 'src')),
        ...await listFiles(resolve(sdkRoot, 'src')),
      ];

      expect(files.some((file) => /\.(scss|sass)$/.test(file))).toBe(false);
    });

    it('宿主与 SDK 的 Vue 组件不再使用 lang="scss"', async () => {
      const vueFiles = [
        ...(await listFiles(resolve(appRoot, 'src'))).filter((file) => file.endsWith('.vue')),
        ...(await listFiles(resolve(sdkRoot, 'src'))).filter((file) => file.endsWith('.vue')),
        resolve(appRoot, '../template-translime-plugin/ui.vue'),
        resolve(appRoot, '../translime-plugin-steam-save-backup/src/ui/ui.vue'),
      ];
      const contents = await Promise.all(vueFiles.map((file) => readFile(file, 'utf8')));

      expect(contents.every((code) => !code.includes('lang="scss"') && !code.includes('lang="sass"'))).toBe(true);
    });

    it('模板插件样式使用扁平 CSS，避免依赖 Sass 嵌套编译', async () => {
      const template = await readFile(
        resolve(appRoot, '../template-translime-plugin/ui.vue'),
        'utf8',
      );

      expect(template).toContain('.plugin-main .red {');
      expect(template).not.toMatch(/\.plugin-main\s*\{\s*\.red\s*\{/s);
    });

    it('app.css 通过 --v-font-body/--v-font-heading 覆盖字体栈', async () => {
      const css = await read('src/renderer/assets/styles/app.css');

      expect(css).toContain("--v-font-body: 'Roboto', 'Noto Sans SC'");
      expect(css).toContain("--v-font-heading: 'Roboto', 'Noto Sans SC'");
    });

    it('SDK post-build 不再拷贝 settings.scss', async () => {
      const script = await readFile(resolve(sdkRoot, 'scripts/post-build.mjs'), 'utf8');

      expect(script).not.toContain('settings.scss');
    });
  });
});
