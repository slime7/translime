import { expect, test } from './fixtures/electronApp';

test.describe('插件生态与管理交互 (Plugins E2E)', () => {
  test('正常发现注入的测试插件，支持搜索过滤与启用/禁用状态切换', async ({ electronContext }) => {
    const { navigateTo, page } = electronContext;

    await navigateTo('PluginCenter');
    await expect(page.locator('.plugin-center').first()).toBeVisible();

    const pluginCard = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"]').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });
    await expect(pluginCard).toContainText('Mock plugin for testing');

    const searchInput = page.locator('[data-test="plugin-search-input"]').first();
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

  test('搜索栏与操作按钮保持单行布局且中间不出现空档', async ({ electronContext }) => {
    const { app, page } = electronContext;

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 10000 });

    // 缩小窗口宽度到此前会触发搜索行换行/空档的尺寸
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html'));
      if (win) {
        win.setSize(720, 600);
      }
    });
    await page.waitForTimeout(600);

    const searchBox = page.locator('[data-test="plugin-search-input"]').first();
    const installLocalBtn = page.locator('[data-test="plugin-install-local-btn"]').first();
    const refreshBtn = page.locator('[data-test="plugin-refresh-btn"]').first();
    await expect(searchBox).toBeVisible();
    await expect(installLocalBtn).toBeVisible();
    await expect(refreshBtn).toBeVisible();

    const searchRect = await searchBox.boundingBox();
    const installRect = await installLocalBtn.boundingBox();
    const refreshRect = await refreshBtn.boundingBox();

    // 防止的回归：搜索行使用 flex-wrap + spacer，窄窗口下按钮换行并在行中留出大空档。
    // 搜索框与两个操作按钮必须仍在同一行
    expect(Math.abs(searchRect.y - installRect.y)).toBeLessThan(16);
    expect(Math.abs(searchRect.y - refreshRect.y)).toBeLessThan(16);
    // 搜索框右缘与第一个按钮左缘之间不允许出现大空档
    expect(installRect.x - (searchRect.x + searchRect.width)).toBeLessThan(48);
  });

  test('首次进入插件页面时应显示插件标题栏', async ({ electronContext }) => {
    const { page } = electronContext;

    const openBtn = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"] [data-test="plugin-open-btn"]').first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // 防止的回归：pageTransitionActive 因路由过渡 after-enter 偶发未触发而停留 true，
    // 首次进入插件页面时标题栏一直不显示
    const titleBar = page.locator('[data-test="plugin-title-bar"]').first();
    await expect(titleBar).toBeVisible({ timeout: 10000 });
    await expect(titleBar).toContainText('Mock');
  });
});
