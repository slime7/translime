import { describe, expect, it } from 'vitest';
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

const packagesRoot = resolve(appRoot, '..');

describe('宿主 mde-vue + Tailwind 样式契约', () => {
  describe('CSS layer 顺序', () => {
    const officialOrder = [
      'tailwind-theme',
      'tailwind-reset',
      'mde.tokens',
      'mde.components',
      'mde.utilities',
      'tailwind-utilities',
      'mde-final',
      'translime-plugin',
    ];

    it('layers.css 按官方顺序声明全部 layer', async () => {
      const css = await read('src/renderer/assets/styles/layers.css');
      const positions = officialOrder.map((name) => css.indexOf(`@layer ${name};`));

      positions.forEach((pos, index) => {
        expect(pos, `缺少 @layer ${officialOrder[index]}; 声明`).toBeGreaterThan(-1);
        if (index > 0) {
          expect(pos, `${officialOrder[index]} 应排在 ${officialOrder[index - 1]} 之后`).toBeGreaterThan(positions[index - 1]);
        }
      });
    });

    it('app.css 在 mde-vue/styles.css 之前导入 layers.css', async () => {
      const css = await read('src/renderer/assets/styles/app.css');
      const layersImport = css.indexOf('./layers.css');
      const mdeStylesImport = css.indexOf('mde-vue/styles.css');

      expect(layersImport).toBeGreaterThan(-1);
      expect(mdeStylesImport).toBeGreaterThan(layersImport);
    });
  });

  describe('tailwind.css 配置', () => {
    it('按官方方式导入 theme、preflight 与 utilities 到对应 layer', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('@import "tailwindcss/theme" layer(tailwind-theme);');
      expect(css).toContain('@import "tailwindcss/preflight" layer(tailwind-reset);');
      expect(css).toContain('@import "tailwindcss/utilities" layer(tailwind-utilities);');
      expect(css).not.toContain('tailwindcss/base');
      expect(css).not.toMatch(/@import\s+["']tailwindcss["']/);
    });

    it('dark/light 变体绑定 mde-vue 主题属性', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('@custom-variant light (&:where([data-mat-theme="light"], [data-mat-theme="light"] *));');
      expect(css).toContain('@custom-variant dark (&:where([data-mat-theme="dark"], [data-mat-theme="dark"] *));');
    });

    it('断点与宿主既有阈值对齐（0/600/960/1280/1920/2560，xxl 命名）', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('--breakpoint-*: initial;');
      expect(css).toMatch(/--breakpoint-xs:\s+0px;/);
      expect(css).toMatch(/--breakpoint-sm:\s+600px;/);
      expect(css).toMatch(/--breakpoint-md:\s+960px;/);
      expect(css).toMatch(/--breakpoint-lg:\s+1280px;/);
      expect(css).toMatch(/--breakpoint-xl:\s+1920px;/);
      expect(css).toMatch(/--breakpoint-xxl:\s+2560px;/);
    });

    it('映射 mde-vue 主题令牌为 Tailwind 颜色', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');
      const colors = [
        'background',
        'surface',
        'surface-variant',
        'surface-container-high',
        'primary',
        'secondary-container',
        'error',
        'on-error-container',
        'on-primary-container',
        'on-surface-variant',
        'outline',
        'outline-variant',
      ];

      colors.forEach((name) => {
        const pattern = new RegExp(`--color-${name}:\\s+var\\(--mat-sys-color-${name}\\);`);
        expect(css, `缺少 --color-${name} 映射`).toMatch(pattern);
      });
    });

    it('接入 mde-vue/tailwind.css 并保持排版工具类由组件库提供', async () => {
      const css = await read('src/renderer/assets/styles/tailwind.css');

      expect(css).toContain('@import "mde-vue/tailwind.css";');
      expect(css).not.toContain('@utility text-body-large');
    });
  });

  describe('构建配置', () => {
    it('vite 渲染配置不再注册 vite-plugin-vuetify', async () => {
      const js = await read('src/vite.renderer.config.js');

      expect(js).not.toContain('vite-plugin-vuetify');
      expect(js).not.toContain('vuetify()');
    });

    it('vite 渲染配置不再使用 styles.configFile 与 preprocessorOptions', async () => {
      const js = await read('src/vite.renderer.config.js');

      expect(js).not.toContain('configFile');
      expect(js).not.toContain('preprocessorOptions');
      expect(js).not.toContain('settings.scss');
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
      expect(config).toMatch(/exclude:\s*\[[\s\S]*'vue',[\s\S]*'mde-vue',[\s\S]*'vue-router'/);
      expect(html).toContain('"vue": "./libs/vue/vue.esm-browser.js"');
    });

    it('宿主入口只安装 mde-vue（宿主 UI 与插件 UI 共用）', async () => {
      const main = await read('src/renderer/index.js');

      expect(main).toContain("@/plugins/matUi'");
      expect(main).not.toContain('plugins/vuetify');
      expect(main).not.toContain('vuetifyCompat');
    });

    it('matUi 提供插件所需的 window.mde$ 运行时', async () => {
      const matUi = await read('src/renderer/plugins/matUi.js');

      expect(matUi).toContain("from 'mde-vue'");
      expect(matUi).toContain('createMatUi');
      expect(matUi).toContain('window.mde$');
    });

    it('插件 CSS layer 应位于宿主层级之后', async () => {
      const css = await read('src/renderer/assets/styles/layers.css');

      expect(css).toContain('@layer translime-plugin;');
      expect(css.indexOf('@layer translime-plugin;')).toBeGreaterThan(css.indexOf('@layer mde-final;'));
    });
  });

  describe('插件 CSS 运行时作用域契约', () => {
    it('app 使用原生 @scope 包裹动态插件样式，并只转换根级选择器', async () => {
      const isolation = await read('src/renderer/utils/pluginStyleIsolation.js');

      expect(isolation).toContain('@scope (');
      expect(isolation).toContain(':scope');
      expect(isolation).toContain('data-plugin-style-id');
      expect(isolation).toContain('normalizeRootSelectorList');
      expect(isolation).not.toContain('CSSStyleSheet');
      expect(isolation).not.toContain('serializeCssRule');
      expect(isolation).not.toContain('scopeSelectorText');
    });

    it('SDK 只保留 CSS 注入封装，不再提供构建期选择器作用域插件', async () => {
      const plugin = await readSdk('src/vite-plugin.js');
      const types = await readSdk('src/vite-plugin.d.ts');

      expect(plugin).toContain('createPluginCssIsolationPlugins');
      expect(plugin).toContain('cssInjectedByJsPlugin(createPluginCssInjectionOptions(styleId))');
      expect(plugin).not.toContain('createPluginCssScopePlugin');
      expect(plugin).not.toContain('scopePluginCss');
      expect(plugin).not.toContain('data-plugin-style-id');
      expect(types).not.toContain('createPluginCssScopePlugin');
    });
  });

  describe('组件类迁移（Tailwind 为主）', () => {
    it('NaviLink.vue 使用 Tailwind 等价类，容器色经 CSS 令牌控制', async () => {
      const vue = await read('src/renderer/views/Layout/components/NaviLink.vue');

      expect(vue).not.toContain('d-block');
      expect(vue).not.toContain('text-decoration-none');
      expect(vue).not.toContain('text-no-wrap');
      expect(vue).not.toContain('text-truncate');
      expect(vue).not.toContain('<v-');
      expect(vue).toContain('text-nowrap truncate');
      expect(vue).toContain('var(--mat-sys-color-secondary-container)');
      expect(vue).toContain('var(--mat-sys-color-on-primary-container)');
    });

    it('PluginCenter.vue 使用 xxl 断点前缀', async () => {
      const vue = await read('src/renderer/views/plugins/PluginCenter.vue');

      expect(vue).toContain('xxl:grid-cols-4');
      expect(vue).not.toContain('2xl:grid-cols-4');
    });

    it('组件内不再残留 Tailwind 旧默认断点（64rem）', async () => {
      const logViewer = await read('src/renderer/views/LogViewer.vue');

      expect(logViewer).not.toContain('width >= 64rem');
    });
  });

  describe('mde 排版契约', () => {
    it('页面标题使用 mde 标题样式，游离文本不残留 Tailwind 原生字号类', async () => {
      const pluginCenter = await read('src/renderer/views/plugins/PluginCenter.vue');
      const setting = await read('src/renderer/views/Setting.vue');
      const logViewer = await read('src/renderer/views/LogViewer.vue');

      expect(pluginCenter).toContain('text-mat-headline-large');
      expect(pluginCenter).not.toContain('font-bold');
      expect(setting).toContain('text-mat-headline-large');
      expect(setting).not.toContain('text-5xl');
      expect(pluginCenter).toContain('<h2 class="text-mat-headline-large">');
      expect(logViewer).toContain('text-mat-headline-large');
      expect(logViewer).toContain('text-mat-body-medium');
    });
  });

  describe('原生 CSS 嵌套契约', () => {
    it('Navigation.vue 的 :deep 保持顶层写法，不嵌在原生嵌套中', async () => {
      const vue = await read('src/renderer/views/Layout/components/Navigation.vue');

      expect(vue).toContain('.navi-panel :deep(.navi-btn) {');
      expect(vue).toContain('gap: 8px;');
      expect(vue).not.toMatch(/\{[^}]*:deep\(/s);
    });
  });

  describe('导航圆角动画契约', () => {
    it('NaviLink.vue 与 Navigation.vue 的头像 hover/active 为纯 CSS 形变且使用有限值圆角', async () => {
      const naviLink = await read('src/renderer/views/Layout/components/NaviLink.vue');
      const navigation = await read('src/renderer/views/Layout/components/Navigation.vue');

      // Tailwind v4 的 rounded-full 是 calc(infinity * 1px)，无法平滑插值到有限圆角；
      // hover/active 圆角为 24px：28px（extra-large）在 56px 图标上恰为正圆会失去形变，
      // 24 是仍可见形变的上限；hover 必须走 :hover 选择器而不是 mat-hover 响应式
      expect(naviLink).toContain('navi-avatar flex items-center');
      expect(naviLink).toContain("'navi-avatar--active' : 'navi-avatar--round'");
      expect(naviLink).not.toContain('mat-hover');
      expect(naviLink).toContain('var(--mat-sys-shape-corner-full)');
      expect(naviLink).toContain('border-radius: 24px;');
      expect(naviLink).toContain('.navi-btn:hover .navi-avatar--round');
      expect(naviLink).toContain('transition:');
      expect(naviLink).not.toContain('rounded-full');

      expect(navigation).not.toContain('mat-hover');
      expect(navigation).toContain('var(--mat-sys-shape-corner-full)');
      expect(navigation).toContain('border-radius: 24px;');
      expect(navigation).toContain('.navi-btn:hover .navi-avatar--round');
    });

    it('侧栏面板以 flex gap 提供图标间距', async () => {
      const navigation = await read('src/renderer/views/Layout/components/Navigation.vue');

      expect(navigation).toContain('display: flex;');
      expect(navigation).toContain('flex-direction: column;');
      expect(navigation).not.toContain('.navi-btn + .navi-btn');
    });
  });

  describe('SDK preview 同步', () => {
    it('preview layers.css 使用官方 layer 顺序', async () => {
      const css = await readSdk('src/preview/layers.css');

      expect(css).toContain('@layer tailwind-theme;');
      expect(css).toContain('@layer tailwind-utilities;');
      expect(css).toContain('@layer mde.tokens;');
      const themeIndex = css.indexOf('@layer tailwind-theme;');
      const componentsIndex = css.indexOf('@layer mde.components;');
      const utilitiesIndex = css.indexOf('@layer tailwind-utilities;');
      const finalIndex = css.indexOf('@layer mde-final;');

      expect(themeIndex).toBeLessThan(componentsIndex);
      expect(utilitiesIndex).toBeGreaterThan(componentsIndex);
      expect(finalIndex).toBeGreaterThan(utilitiesIndex);
    });

    it('preview 使用 mde-vue 样式入口，不再依赖 Vuetify 与 settings.scss', async () => {
      const main = await readSdk('src/preview/main.js');
      const plugin = await readSdk('src/vite-plugin.js');
      const layers = await readSdk('src/preview/layers.css');

      expect(main).toContain("import 'mde-vue/styles.css'");
      expect(main).toContain('createMatUi');
      expect(main).not.toContain('vuetify');
      expect(plugin).not.toContain('getPreviewSettingsPath');
      expect(plugin).not.toContain('preprocessorOptions');
      expect(plugin).not.toContain('settings.scss');
      expect(layers).toContain('@layer translime-plugin;');
    });

    it('SDK vite 插件只自动注入 mde-vue 组件，不再处理 Vuetify 组件', async () => {
      const plugin = await readSdk('src/vite-plugin.js');

      expect(plugin).toContain('window.mde$?.components');
      expect(plugin).not.toContain('window.vuetify$');
      expect(plugin).not.toContain('V[A-Z]');
      expect(plugin).not.toContain('<v-');
    });

    it('SDK 不再导出 Vuetify 运行时访问器', async () => {
      const index = await readSdk('src/index.js');
      const types = await readSdk('src/index.d.ts');

      expect(index).not.toContain('useVuetify');
      expect(types).not.toContain('useVuetify');
      expect(index).toContain('export function useMat()');
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

    it('app.css 通过 mde-vue 参考字体变量覆盖字体栈', async () => {
      const css = await read('src/renderer/assets/styles/app.css');

      expect(css).toContain("--mat-ref-typeface-brand: 'Roboto', 'Noto Sans SC'");
      expect(css).toContain("--mat-ref-typeface-plain: 'Roboto', 'Noto Sans SC'");
    });

    it('SDK post-build 不再拷贝 settings.scss', async () => {
      const script = await readFile(resolve(sdkRoot, 'scripts/post-build.mjs'), 'utf8');

      expect(script).not.toContain('settings.scss');
    });
  });

  describe('Vuetify 移除守卫', () => {
    it('宿主、SDK 与插件源码不再引用 Vuetify', async () => {
      const scannedRoots = [
        resolve(appRoot, 'src'),
        resolve(sdkRoot, 'src'),
        // 本文件自身需要写出被禁止的标识符，扫描时排除
        resolve(appRoot, 'tests/e2e'),
        resolve(appRoot, 'tests/mocks'),
        ...['template-translime-plugin', 'translime-plugin-bangumi-logs', 'translime-plugin-mahjong-2-emoji', 'translime-plugin-rtmp-recorder', 'translime-plugin-static-server']
          .flatMap((name) => [resolve(packagesRoot, name, 'src'), resolve(packagesRoot, name, 'package.json')]),
      ];
      const files = (await Promise.all(scannedRoots.map(async (target) => {
        try {
          return await listFiles(target);
        } catch {
          return [target];
        }
      }))).flat();
      const offenders = await Promise.all(files.map(async (file) => {
        if (!/\.(js|vue|json|mjs|css|ts)$/.test(file)) {
          return null;
        }
        const content = await readFile(file, 'utf8');
        return /vuetify/i.test(content) ? file : null;
      }));

      expect(offenders.filter(Boolean)).toEqual([]);
    });

    it('工作区依赖中不再声明 vuetify 与 vite-plugin-vuetify', async () => {
      const manifests = await Promise.all([
        read('package.json'),
        readSdk('package.json'),
        ...['template-translime-plugin', 'translime-plugin-bangumi-logs', 'translime-plugin-mahjong-2-emoji', 'translime-plugin-rtmp-recorder', 'translime-plugin-static-server']
          .map(async (name) => readFile(resolve(packagesRoot, name, 'package.json'), 'utf8')),
      ]);

      manifests.forEach((manifest) => {
        expect(manifest).not.toContain('vite-plugin-vuetify');
        expect(manifest).not.toContain('"vuetify"');
      });
    });
  });
});
