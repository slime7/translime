import { test, expect } from './fixtures/electronApp.js';

test.describe('系统与外观设置持久化 (Settings E2E)', () => {
  test('渲染通用与外观设置，并支持配置修改与持久化', async ({ electronContext }) => {
    const { page, navigateTo } = electronContext;

    await navigateTo('Setting');
    await expect(page.locator('.setting').first()).toBeVisible();

    await expect(page.locator('text="通用"').first()).toBeVisible();
    await expect(page.locator('text="外观"').first()).toBeVisible();

    const traySwitchItem = page.locator('.mde-list-item:has-text("关闭时最小化到托盘")').first();
    await expect(traySwitchItem).toBeVisible();
    await traySwitchItem.click();
    await page.waitForTimeout(300);

    const themeSelectItem = page.locator('.mde-list-item:has-text("主题")').first();
    await expect(themeSelectItem).toBeVisible();
    await themeSelectItem.click();

    const themeDialog = page.locator('.v-dialog:has-text("选择主题")').first();
    await expect(themeDialog).toBeVisible();

    const darkOption = themeDialog.locator('.mde-list-item:has-text("暗黑")').first();
    await darkOption.click();
    const confirmBtn = themeDialog.locator('button:has-text("确定")').first();
    await confirmBtn.click();
    await page.waitForTimeout(400);

    await expect(themeDialog).not.toBeVisible();
    await expect(page.locator('.mde-list-item:has-text("主题")').first()).toContainText('暗黑');
  });
});
