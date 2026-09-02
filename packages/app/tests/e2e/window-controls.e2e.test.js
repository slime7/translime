import { expect, test } from './fixtures/electronApp';

test.describe('窗口控制栏', () => {
  test('Windows 使用系统原生窗口控制按钮', async ({ electronContext }) => {
    const { page } = electronContext;
    const platform = await page.evaluate(() => window.electron?.platform);

    test.skip(platform !== 'win32', '该回归场景只适用于 Windows');

    await expect(page.locator('.window-controls')).toHaveCount(0);
    await expect(page.locator('.window-control-placeholder')).toHaveCount(1);
  });
});
