import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';

/**
 * devPluginWizard 是纯文件系统模块（不依赖 Electron），
 * 直接在临时目录里做真实读写，验证创建/引入插件的业务契约：
 * 包名约定、占位符替换、SDK 依赖改写、链接冲突保护。
 */

const {
  SDK_VERSION_RANGE,
  buildTemplateReplacements,
  createDevPlugin,
  isCreatePluginName,
  linkDevPlugin,
  toPluginTitle,
} = await import('@main/core/plugin-loader/devPluginWizard');

const FAKE_ICON = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const writeTemplate = (templateDir) => {
  fs.mkdirSync(path.join(templateDir, 'src', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(templateDir, 'node_modules', 'some-dep'), { recursive: true });
  fs.mkdirSync(path.join(templateDir, 'dist'), { recursive: true });

  fs.writeFileSync(
    path.join(templateDir, 'index.js'),
    "export const PLUGIN_ID = 'translime-plugin-example'; // plugin title / a plugin example / UiExample\n",
    'utf8',
  );
  fs.writeFileSync(
    path.join(templateDir, 'src', 'ui', 'ui.vue'),
    '<template><div class="UiExample">plugin description</div></template>\n',
    'utf8',
  );
  fs.writeFileSync(path.join(templateDir, 'icon.png'), FAKE_ICON);
  fs.writeFileSync(path.join(templateDir, 'node_modules', 'some-dep', 'index.js'), 'ignored', 'utf8');
  fs.writeFileSync(path.join(templateDir, 'dist', 'index.cjs.js'), 'ignored', 'utf8');
  fs.writeFileSync(
    path.join(templateDir, 'package.json'),
    `${JSON.stringify({
      name: 'translime-plugin-example',
      version: '3.0.0',
      private: true,
      main: './dist/index.cjs.js',
      devDependencies: {
        'translime-sdk': 'workspace:*',
      },
      plugin: {
        title: 'plugin title',
        description: 'plugin description',
      },
    }, null, 2)}\n`,
    'utf8',
  );
};

describe('plugin-loader/devPluginWizard', () => {
  let workDir;
  let templateDir;
  let devModulesPath;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translime-wizard-'));
    templateDir = path.join(workDir, 'template');
    devModulesPath = path.join(workDir, 'plugins_dev', 'node_modules');
    writeTemplate(templateDir);
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  describe('isCreatePluginName', () => {
    it('接受符合命名约定的包名', () => {
      expect(isCreatePluginName('translime-plugin-demo')).toBe(true);
      expect(isCreatePluginName('translime-plugin-foo-bar-2')).toBe(true);
    });

    it('拒绝缺少前缀、大写字母、下划线或空值的包名', () => {
      expect(isCreatePluginName('my-plugin')).toBe(false);
      expect(isCreatePluginName('translime-plugin-Demo')).toBe(false);
      expect(isCreatePluginName('translime-plugin-foo_bar')).toBe(false);
      expect(isCreatePluginName('')).toBe(false);
      expect(isCreatePluginName(undefined)).toBe(false);
    });
  });

  describe('toPluginTitle 与 buildTemplateReplacements', () => {
    it('由包名推导标题并保持与脚手架一致的替换表', () => {
      expect(toPluginTitle('translime-plugin-foo-bar')).toBe('Foo Bar');
      const replacements = buildTemplateReplacements({ name: 'translime-plugin-foo-bar' });
      const map = new Map(replacements);
      expect(map.get('translime-plugin-example')).toBe('translime-plugin-foo-bar');
      expect(map.get('plugin title')).toBe('Foo Bar');
      expect(map.get('plugin description')).toBe('Foo Bar plugin');
      expect(map.get('UiExample')).toBe('FooBarUi');
    });
  });

  describe('createDevPlugin', () => {
    it('复制模板、替换占位符并改写 SDK 依赖为 npm 版本范围', () => {
      const targetDir = path.join(workDir, 'projects', 'translime-plugin-demo');

      const result = createDevPlugin({
        templateDir,
        targetDir,
        devModulesPath,
        name: 'translime-plugin-demo',
        title: '',
        description: '',
      });

      expect(result.packageName).toBe('translime-plugin-demo');

      // 文本文件完成占位符替换
      const indexContent = fs.readFileSync(path.join(targetDir, 'index.js'), 'utf8');
      expect(indexContent).toContain('translime-plugin-demo');
      expect(indexContent).toContain('Demo');
      expect(indexContent).toContain('DemoUi');
      expect(indexContent).not.toContain('translime-plugin-example');

      const uiContent = fs.readFileSync(path.join(targetDir, 'src', 'ui', 'ui.vue'), 'utf8');
      expect(uiContent).toContain('DemoUi');
      expect(uiContent).toContain('Demo plugin');

      // package.json 被重写：真实包名、元数据、SDK 依赖版本
      const packageJson = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
      expect(packageJson.name).toBe('translime-plugin-demo');
      expect(packageJson.plugin.title).toBe('Demo');
      expect(packageJson.devDependencies['translime-sdk']).toBe(SDK_VERSION_RANGE);

      // 二进制文件原样复制
      expect(fs.readFileSync(path.join(targetDir, 'icon.png')).equals(FAKE_ICON)).toBe(true);

      // node_modules 与 dist 不进入模板产物
      expect(fs.existsSync(path.join(targetDir, 'node_modules'))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, 'dist'))).toBe(false);

      // 开发插件目录出现指向项目的链接，且可穿透读取
      const linkPath = path.join(devModulesPath, 'translime-plugin-demo');
      expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(linkPath, 'package.json'))).toBe(true);
    });

    it('目标目录已存在时抛错，不覆盖既有文件', () => {
      const targetDir = path.join(workDir, 'translime-plugin-demo');
      fs.mkdirSync(targetDir);
      fs.writeFileSync(path.join(targetDir, 'keep.txt'), 'user data', 'utf8');

      expect(() => createDevPlugin({
        templateDir,
        targetDir,
        devModulesPath,
        name: 'translime-plugin-demo',
      })).toThrow();

      expect(fs.readFileSync(path.join(targetDir, 'keep.txt'), 'utf8')).toBe('user data');
    });

    it('非法包名直接抛错', () => {
      expect(() => createDevPlugin({
        templateDir,
        targetDir: path.join(workDir, 'translime-plugin-Bad_Name'),
        devModulesPath,
        name: 'translime-plugin-Bad_Name',
      })).toThrow();
    });
  });

  describe('linkDevPlugin', () => {
    it('把合法插件项目链接进开发插件目录', () => {
      const sourceDir = path.join(workDir, 'my-plugin-repo', 'translime-plugin-local');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, 'package.json'),
        JSON.stringify({ name: 'translime-plugin-local', plugin: { title: 'Local' } }),
        'utf8',
      );

      const result = linkDevPlugin({ sourceDir, devModulesPath });

      expect(result.packageName).toBe('translime-plugin-local');
      expect(fs.lstatSync(result.linkPath).isSymbolicLink()).toBe(true);
      // 链接指向解析后的真实目录
      expect(fs.realpathSync(result.linkPath)).toBe(fs.realpathSync(sourceDir));
    });

    it('同一目录重复引入时幂等成功', () => {
      const sourceDir = path.join(workDir, 'translime-plugin-twice');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, 'package.json'),
        JSON.stringify({ name: 'translime-plugin-twice', plugin: { title: 'Twice' } }),
        'utf8',
      );

      const first = linkDevPlugin({ sourceDir, devModulesPath });
      const second = linkDevPlugin({ sourceDir, devModulesPath });
      expect(second.linkPath).toBe(first.linkPath);
    });

    it('同名链接指向不同目录时抛错，不静默覆盖', () => {
      const makePlugin = (dirName) => {
        const sourceDir = path.join(workDir, dirName);
        fs.mkdirSync(sourceDir, { recursive: true });
        fs.writeFileSync(
          path.join(sourceDir, 'package.json'),
          JSON.stringify({ name: 'translime-plugin-clash', plugin: { title: 'Clash' } }),
          'utf8',
        );
        return sourceDir;
      };
      linkDevPlugin({ sourceDir: makePlugin('first-clash'), devModulesPath });

      expect(() => linkDevPlugin({
        sourceDir: makePlugin('second-clash'),
        devModulesPath,
      })).toThrow();
    });

    it('目录缺少 package.json 时抛错', () => {
      const emptyDir = path.join(workDir, 'empty-dir');
      fs.mkdirSync(emptyDir, { recursive: true });

      expect(() => linkDevPlugin({ sourceDir: emptyDir, devModulesPath })).toThrow();
    });

    it('包名不符合约定或缺少 plugin 字段时抛错', () => {
      const badNameDir = path.join(workDir, 'bad-name');
      fs.mkdirSync(badNameDir, { recursive: true });
      fs.writeFileSync(
        path.join(badNameDir, 'package.json'),
        JSON.stringify({ name: 'not-a-plugin', plugin: {} }),
        'utf8',
      );

      const missingPluginDir = path.join(workDir, 'missing-plugin-field');
      fs.mkdirSync(missingPluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(missingPluginDir, 'package.json'),
        JSON.stringify({ name: 'translime-plugin-nofield' }),
        'utf8',
      );

      expect(() => linkDevPlugin({ sourceDir: badNameDir, devModulesPath })).toThrow();
      expect(() => linkDevPlugin({ sourceDir: missingPluginDir, devModulesPath })).toThrow();
    });
  });
});
