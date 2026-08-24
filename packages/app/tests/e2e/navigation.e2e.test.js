import { expect, test } from './fixtures/electronApp';

test.describe('侧边栏与核心路由导航 (Navigation E2E)', () => {
  test('在首页、插件、设置、关于与日志查看器间平稳切换', async ({ electronContext }) => {
    const { navigateTo, page } = electronContext;

    await expect(page.locator('.home').first()).toBeVisible();

    await navigateTo('Plugins');
    await expect(page).toHaveURL(/.*#\/plugins/);
    await expect(page.locator('.plugins').first()).toBeVisible();

    await navigateTo('Setting');
    await expect(page).toHaveURL(/.*#\/setting/);
    await expect(page.locator('.setting').first()).toBeVisible();

    await navigateTo('About');
    await expect(page).toHaveURL(/.*#\/about/);
    await expect(page.locator('.about').first()).toBeVisible();

    const logViewerBtn = page.locator('[data-test="about-open-log-btn"]').first();
    if (await logViewerBtn.isVisible()) {
      await logViewerBtn.click();
      await page.waitForTimeout(400);
      await expect(page).toHaveURL(/.*#\/logs/);
      await expect(page.locator('.log-viewer').first()).toBeVisible();
    }

    await navigateTo('Home');
    await expect(page).toHaveURL(/.*#(?:\/home|\/|$)/);
    await expect(page.locator('.home').first()).toBeVisible();
  });
});
