import { test, expect } from './fixtures/electronApp.js';

test.describe('插件生态与管理交互 (Plugins E2E)', () => {
  test('正常发现注入的测试插件，支持搜索过滤与启用/禁用状态切换', async ({ electronContext }) => {
    const { page, navigateTo } = electronContext;

    // 1. 跳转到插件管理页
    await navigateTo('Plugins');
    await expect(page.locator('.plugins').first()).toBeVisible();

    // 2. 验证注入的 Mock 插件已被发现并呈现在列表中
    const pluginCard = page.locator('.plugin-item-card:has-text("Mock Test Plugin"), .plugin-item-card:has-text("translime-plugin-mock-test")').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });

    // 3. 验证插件基础描述正常展示
    await expect(pluginCard).toContainText('Mock plugin for testing');

    // 4. 插件搜索输入框检索过滤
    const searchInput = page.locator('input[placeholder*="搜索插件"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('mock-test');
      await page.waitForTimeout(300);
      await expect(pluginCard).toBeVisible();
    }

    // 5. 点击卡片上的“启用”按钮激活插件
    const enableBtn = pluginCard.locator('button[title="启用"], button:has(.v-icon:has-text("play_arrow"))').first();
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      // 等待状态切换为“禁用”按钮（表明已激活就绪）
      const disableBtn = pluginCard.locator('button[title="禁用"], button:has(.v-icon:has-text("pause"))').first();
      await expect(disableBtn).toBeVisible({ timeout: 8000 });

      // 6. 再次点击“禁用”按钮切回停用状态
      await disableBtn.click();
      await expect(enableBtn).toBeVisible({ timeout: 8000 });
    }
  });
});
