import { expect, test } from './fixtures/electronApp.js';

test.describe('插件生态与管理交互 (Plugins E2E)', () => {
  test('正常发现注入的测试插件，支持搜索过滤与启用/禁用状态切换', async ({ electronContext }) => {
    const { navigateTo, page } = electronContext;

    await navigateTo('Plugins');
    await expect(page.locator('.plugins').first()).toBeVisible();

    const pluginCard = page.locator('.plugin-item-card:has-text("Mock Test Plugin"), .plugin-item-card:has-text("translime-plugin-mock-test")').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });
    await expect(pluginCard).toContainText('Mock plugin for testing');

    const searchInput = page.locator('input[placeholder*="搜索插件"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('mock-test');
      await page.waitForTimeout(300);
      await expect(pluginCard).toBeVisible();
    }

    const enableBtn = pluginCard.locator('button[title="启用"], button:has(.v-icon:has-text("play_arrow"))').first();
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      const disableBtn = pluginCard.locator('button[title="禁用"], button:has(.v-icon:has-text("pause"))').first();
      await expect(disableBtn).toBeVisible({ timeout: 8000 });

      await disableBtn.click();
      await expect(enableBtn).toBeVisible({ timeout: 8000 });
    }
  });
});
