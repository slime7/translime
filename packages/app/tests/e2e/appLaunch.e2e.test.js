import { test, expect } from './fixtures/electronApp.js';

test.describe('应用启动与主窗口渲染 (App Launch E2E)', () => {
  test('启动后成功呈现主窗口并加载根容器', async ({ electronContext }) => {
    const { page, app } = electronContext;

    expect(page).toBeDefined();
    const title = await page.title();
    expect(title).toBeDefined();

    const appElement = page.locator('#app');
    await expect(appElement).toBeVisible();

    const navBar = page.locator('nav.navi-drawer, nav').first();
    await expect(navBar).toBeVisible();

    const isPackaged = await app.evaluate(({ app: electronMainApp }) => electronMainApp.isPackaged);
    expect(typeof isPackaged).toBe('boolean');
  });
});
