import { describe, expect, it } from 'vitest';
import translimeSdk from '../../src/vite-plugin.js';

const createPlugin = () => translimeSdk();

describe('translimeSdk vite 插件组件注入', () => {
  it('从 window.mde$ 解构模板中的 mat-* 标签与 PascalCase 组件引用', () => {
    const plugin = createPlugin();
    plugin.config({ build: { lib: { entry: './src/ui.vue' } } }, { mode: 'production', command: 'build' });

    const result = plugin.transform(
      '<template><mat-btn>保存</mat-btn><MatSelect :items="items" /></template>',
      'src/ui.vue',
    );

    expect(result.code).toMatch(/const \{[^}]*\bMatBtn\b[^}]*\} = \(typeof window !== 'undefined' && window\.mde\$\?\.components \|\| \{\}\);/);
    expect(result.code).toMatch(/const \{[^}]*\bMatSelect\b[^}]*\} = \(typeof window !== 'undefined' && window\.mde\$\?\.components \|\| \{\}\);/);
    expect(result.code).not.toContain('vuetify');
  });

  it('不再为 v-* 标签注入 Vuetify 组件', () => {
    const plugin = createPlugin();

    expect(plugin.transform(
      '<template><v-btn>保存</v-btn></template>',
      'src/ui.vue',
    )).toBeNull();
  });

  it('已显式导入的组件不重复注入', () => {
    const plugin = createPlugin();

    expect(plugin.transform(
      `import { MatBtn } from 'mde-vue';\nconst a = MatBtn;\n<template><mat-btn /></template>`,
      'src/ui.vue',
    )).toBeNull();
  });

  it('未使用任何 mat-* 组件时不改写源码', () => {
    const plugin = createPlugin();

    expect(plugin.transform('<template><div>纯文本</div></template>', 'src/ui.vue')).toBeNull();
  });

  it('preview 模式只排除 mde-vue 的依赖预构建', () => {
    const plugin = createPlugin();
    const config = plugin.config(
      { build: { lib: { entry: './src/ui.vue' } } },
      { mode: 'preview', command: 'serve' },
    );

    expect(config.optimizeDeps.exclude).toContain('mde-vue');
    expect(config.optimizeDeps.exclude).not.toContain('vuetify');
  });
});
