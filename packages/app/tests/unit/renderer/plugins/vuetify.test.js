import {
  argbFromHex,
} from '@material/material-color-utilities';
import {
  describe, expect, it,
} from 'vitest';
import vuetify from '@/plugins/vuetify';
import {
  getReadableColors,
  getVuetifyColors,
  themeFromSourceColor,
} from '@/utils/mdColorHelper';

describe('默认 Vuetify 主题', () => {
  it('应该与 Expressive 2025 主题生成结果保持一致', () => {
    const generated = getVuetifyColors(getReadableColors(
      themeFromSourceColor(argbFromHex('#20a6fc'), 'SchemeExpressive'),
    ));
    const configuredThemes = vuetify.theme.themes.value;

    Object.entries(generated.light).forEach(([token, value]) => {
      expect(configuredThemes.light.colors[token]).toBe(value);
    });
    Object.entries(generated.dark).forEach(([token, value]) => {
      expect(configuredThemes.dark.colors[token]).toBe(value);
    });
  });
});
