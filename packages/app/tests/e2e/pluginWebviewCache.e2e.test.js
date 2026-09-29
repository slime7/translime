import { expect, test } from './fixtures/electronApp';

const MOCK_PLUGIN_ID = 'translime-plugin-mock-test';
const PLUGIN_PAGE_HASH = `#/plugins/${MOCK_PLUGIN_ID}`;
const TYPED_TEXT = 'e2e-persist';

/**
 * 在插件 webview 的 guest 文档中执行脚本（宿主页面 electron webview API）。
 *
 * Playwright 无法直接访问 Electron webview 的 guest frame，必须经宿主页面的
 * `<webview>.executeJavaScript` 进入插件 UI 的文档。
 * @param {import('@playwright/test').Page} page - 主窗口页面。
 * @param {string} script - 在 guest 文档中执行的脚本表达式。
 * @returns {Promise<unknown>} 脚本执行结果。
 */
const runInPluginUi = (page, script) => page.evaluate((code) => {
  const webview = document.querySelector('webview');
  if (!webview) {
    throw new Error('未找到插件 webview');
  }
  return webview.executeJavaScript(code);
}, script);

test.describe('插件 Webview 缓存 (Plugin Webview Cache E2E)', () => {
  test('离开插件页面再返回，插件 UI 内已输入的内容不丢失', async ({ electronContext }) => {
    const { page, navigateTo } = electronContext;

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 10000 });

    const openBtn = page.locator(`[data-test="plugin-card"][data-test-package="${MOCK_PLUGIN_ID}"] [data-test="plugin-open-btn"]`).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // 等待插件 webview 完成加载，并在插件 UI 输入框中输入内容
    await expect.poll(async () => runInPluginUi(page, 'Boolean(document.querySelector(\'.plugin-main input\'))'), { timeout: 15000 }).toBe(true);
    const typedValue = await runInPluginUi(page, `
      (async () => {
        const input = document.querySelector('.plugin-main input');
        input.focus();
        document.execCommand('insertText', false, ${JSON.stringify(TYPED_TEXT)});
        return input.value;
      })()
    `);
    expect(typedValue).toBe(TYPED_TEXT);
    await expect.poll(async () => runInPluginUi(page, "document.querySelector('.plugin-main .red')?.textContent || ''")).toContain(TYPED_TEXT);

    // 离开插件页面（普通页与插件页的路由包裹组件会切换），再返回插件页面
    await navigateTo('Setting');
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, PLUGIN_PAGE_HASH);
    await page.waitForTimeout(600);

    // 防止的回归：webview 缓存容器曾位于 router-view 插槽内，路由切换时插槽包裹
    // 组件（div/mat-scroll-area）整棵销毁重建，插件 webview 被一并卸载，重新进入
    // 插件页时插件 UI 的输入内容等运行状态丢失
    await expect.poll(async () => runInPluginUi(page, "document.querySelector('.plugin-main input')?.value || ''"), { timeout: 10000 }).toBe(TYPED_TEXT);
    await expect.poll(async () => runInPluginUi(page, "document.querySelector('.plugin-main .red')?.textContent || ''")).toContain(TYPED_TEXT);
  });
});
