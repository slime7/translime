import { test, expect } from './fixtures/electronApp.js';

test.describe('应用启动与主窗口渲染 (App Launch E2E)', () => {
  test('启动后成功呈现主窗口并加载根容器', async ({ electronContext }) => {
    const { page, app } = electronContext;

    // 验证窗口实例与基本属性
    expect(page).toBeDefined();
    const title = await page.title();
    expect(title).toBeDefined();

    // 验证核心 DOM 与 App 容器正常挂载
    const appElement = page.locator('#app');
    await expect(appElement).toBeVisible();

    // 验证左侧主导航栏正常渲染
    const navBar = page.locator('nav.navi-drawer, nav').first();
    await expect(navBar).toBeVisible();

    // 验证主进程状态正常
    const isPackaged = await app.evaluate(({ app: electronMainApp }) => electronMainApp.isPackaged);
    expect(typeof isPackaged).toBe('boolean');
  });
});
