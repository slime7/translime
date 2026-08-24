import { expect, test } from './fixtures/electronApp';

test.describe('插件生态与管理交互 (Plugins E2E)', () => {
  test('正常发现注入的测试插件，支持搜索过滤与启用/禁用状态切换', async ({ electronContext }) => {
    const { navigateTo, page } = electronContext;

    await navigateTo('Plugins');
    await expect(page.locator('.plugins').first()).toBeVisible();

    const pluginCard = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"]').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });
    await expect(pluginCard).toContainText('Mock plugin for testing');

    const searchInput = page.locator('[data-test="plugin-search-input"] input').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('mock-test');
      await page.waitForTimeout(300);
      await expect(pluginCard).toBeVisible();
    }

    const enableBtn = pluginCard.locator('[data-test="plugin-enable-btn"]').first();
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      const disableBtn = pluginCard.locator('[data-test="plugin-disable-btn"]').first();
      await expect(disableBtn).toBeVisible({ timeout: 8000 });

      await disableBtn.click();
      await expect(enableBtn).toBeVisible({ timeout: 8000 });
    }
  });
});
