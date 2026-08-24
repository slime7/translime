import { expect, test } from './fixtures/electronApp';

test.describe('应用启动与主窗口渲染 (App Launch E2E)', () => {
  test('启动后成功呈现主窗口并加载根容器', async ({ electronContext }) => {
    const { app, page } = electronContext;

    expect(page).toBeDefined();
    const title = await page.title();
    expect(title).toBeDefined();

    const appElement = page.locator('#app');
    await expect(appElement).toBeVisible();

    const homeNav = page.locator('[data-test="nav-home"]').first();
    await expect(homeNav).toBeVisible();

    const pluginsNav = page.locator('[data-test="nav-plugins"]').first();
    await expect(pluginsNav).toBeVisible();

    const settingNav = page.locator('[data-test="nav-setting"]').first();
    await expect(settingNav).toBeVisible();

    const aboutNav = page.locator('[data-test="nav-about"]').first();
    await expect(aboutNav).toBeVisible();

    const isPackaged = await app.evaluate(({ app: electronMainApp }) => electronMainApp.isPackaged);
    expect(typeof isPackaged).toBe('boolean');
  });
});
