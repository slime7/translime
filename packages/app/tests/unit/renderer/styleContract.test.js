import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

const appRoot = resolve(testDir, '../../..');
const sdkRoot = resolve(appRoot, '../sdk');

const read = (relativePath) => readFile(resolve(appRoot, relativePath), 'utf8');
const readSdk = (relativePath) => readFile(resolve(sdkRoot, relativePath), 'utf8');

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

    it('app.scss 不再声明旧的 tailwind 中间层顺序', async () => {
      const scss = await read('src/renderer/assets/styles/app.scss');
      expect(scss).not.toContain('vuetify-overrides, tailwind');
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
      const vuetifyIndex = js.indexOf('vuetify({');

      expect(tailwindIndex).toBeGreaterThan(-1);
      expect(vuetifyIndex).toBeGreaterThan(tailwindIndex);
    });

    it('settings.scss 按需禁用与 Tailwind 冲突的工具类，关闭调色板并对齐 grid 断点', async () => {
      const scss = await read('src/renderer/assets/styles/settings.scss');

      expect(scss).toContain('$color-pack: false');
      expect(scss).not.toContain('$utilities: false');
      expect(scss).toContain("'display': false");
      expect(scss).toContain("'margin-top': false");
      expect(scss).toContain('$grid-breakpoints');
      expect(scss).toContain("'sm': 600px");
      expect(scss).toContain("'md': 960px");
      expect(scss).toContain("'lg': 1280px");
      expect(scss).toContain("'xl': 1920px");
      expect(scss).toContain("'xxl': 2560px");
      expect(scss).toContain('$body-font-family');
    });

    it('vuetify.js 保留运行时主题工具类并显式对齐 display 阈值', async () => {
      const js = await read('src/renderer/plugins/vuetify.js');

      expect(js).not.toContain('utilities: false');
      expect(js).toContain("mobileBreakpoint: 'md'");
      expect(js).toContain('xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920, xxl: 2560');
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

    it('preview settings.scss 与宿主保持一致', async () => {
      const scss = await readSdk('src/preview/settings.scss');

      expect(scss).toContain('$color-pack: false');
      expect(scss).not.toContain('$utilities: false');
      expect(scss).toContain("'display': false");
      expect(scss).toContain('$grid-breakpoints');
      expect(scss).toContain("'md': 960px");
      expect(scss).toContain("'xxl': 2560px");
    });

    it('preview App.vue 恢复原 Vuetify 工具类写法', async () => {
      const vue = await readSdk('src/preview/App.vue');

      expect(vue).toContain('d-flex');
      expect(vue).toContain('text-medium-emphasis');
      expect(vue).toContain('text-body-small');
    });
  });
});
