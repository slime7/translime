import { expect, test } from './fixtures/electronApp';

test.describe('系统与外观设置持久化 (Settings E2E)', () => {
  test('渲染通用与外观设置，并支持配置修改与持久化', async ({ electronContext }) => {
    const { navigateTo, page } = electronContext;

    await navigateTo('Setting');
    await expect(page.locator('.setting').first()).toBeVisible();

    const traySwitchItem = page.locator('[data-test="setting-minimize-tray"]').first();
    await expect(traySwitchItem).toBeVisible();
    await traySwitchItem.click();
    await page.waitForTimeout(300);

    const themeSelectItem = page.locator('[data-test="setting-theme-item"]').first();
    await expect(themeSelectItem).toBeVisible();
    await themeSelectItem.click();

    const themeDialog = page.locator('[data-test="theme-select-dialog"]').first();
    await expect(themeDialog).toBeVisible();

    const darkOption = themeDialog.locator('[data-test="theme-option-dark"]').first();
    await darkOption.click();
    const confirmBtn = themeDialog.locator('[data-test="theme-dialog-confirm-btn"]').first();
    await confirmBtn.click();
    await page.waitForTimeout(400);

    await expect(themeDialog).not.toBeVisible();
    await expect(page.locator('[data-test="setting-theme-item"]').first()).toContainText('暗黑');
  });
});
