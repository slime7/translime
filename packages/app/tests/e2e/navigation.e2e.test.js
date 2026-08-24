import { test, expect } from './fixtures/electronApp.js';

test.describe('侧边栏与核心路由导航 (Navigation E2E)', () => {
  test('在首页、插件、设置、关于与日志查看器间平稳切换', async ({ electronContext }) => {
    const { page, navigateTo } = electronContext;

    // 1. 初始为首页
    await expect(page.locator('.home').first()).toBeVisible();

    // 2. 跳转到插件页
    await navigateTo('Plugins');
    await expect(page).toHaveURL(/.*#\/plugins/);
    await expect(page.locator('.plugins').first()).toBeVisible();

    // 3. 跳转到设置页
    await navigateTo('Setting');
    await expect(page).toHaveURL(/.*#\/setting/);
    await expect(page.locator('.setting').first()).toBeVisible();

    // 4. 跳转到关于页
    await navigateTo('About');
    await expect(page).toHaveURL(/.*#\/about/);
    await expect(page.locator('.about').first()).toBeVisible();

    // 5. 从关于页进入日志查看器
    const logViewerBtn = page.locator('button:has-text("查看日志"), a[href*="#/logs"], button:has-text("日志")').first();
    if (await logViewerBtn.isVisible()) {
      await logViewerBtn.click();
      await page.waitForTimeout(400);
      await expect(page).toHaveURL(/.*#\/logs/);
      await expect(page.locator('.log-viewer').first()).toBeVisible();
    }

    // 6. 返回首页
    await navigateTo('Home');
    await expect(page).toHaveURL(/.*#(?:\/home|\/|$)/);
    await expect(page.locator('.home').first()).toBeVisible();
  });
});
