import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures/electronApp';

const DEV_PLUGIN_ID = 'translime-plugin-dev-e2e';

test.use({ devPluginScenario: true });

test.describe('开发插件热重载 (Dev Plugin Hot Reload E2E)', () => {
  test('构建产物连续变化后 webview 原地重载，插件 UI 更新且保持可交互', async ({ electronContext }) => {
    test.setTimeout(120000);
    const { page, userDataDir } = electronContext;

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 15000 });
    const openBtn = page.locator(`[data-test="plugin-card"][data-test-package="${DEV_PLUGIN_ID}"] [data-test="plugin-open-btn"]`).first();
    await expect(openBtn).toBeVisible({ timeout: 15000 });
    await openBtn.click();

    const runInGuest = (script) => page.evaluate((code) => {
      const webview = document.querySelector('webview');
      if (!webview) {
        throw new Error('未找到插件 webview');
      }
      return webview.executeJavaScript(code);
    }, script);

    await expect.poll(
      async () => runInGuest("Boolean(document.querySelector('.plugin-main input'))"),
      { timeout: 30000 },
    ).toBe(true);
    const webviewIdBefore = await page.evaluate(() => document.querySelector('webview').getWebContentsId());

    // 模拟真实构建：主进程入口先落盘，UI 产物间隔约 2 秒后落盘，触发两轮自动重启
    const distDir = path.join(userDataDir, 'plugins_dev', 'node_modules', DEV_PLUGIN_ID, 'dist');
    const mainPath = path.join(distDir, 'index.cjs.js');
    const uiPath = path.join(distDir, 'ui.esm.js');
    fs.writeFileSync(mainPath, fs.readFileSync(mainPath, 'utf8').replace('"plugin loaded"', '"plugin loaded v2"'), 'utf8');
    await page.waitForTimeout(2000);
    fs.writeFileSync(uiPath, fs.readFileSync(uiPath, 'utf8').replace('ref("hello")', 'ref("HOT-RELOADED")'), 'utf8');

    // 防止的回归：两轮连续重启曾销毁重建 webview 元素，新 webview 长时间
    // 无响应，必须手动重启插件才能恢复
    await expect.poll(
      async () => runInGuest("document.querySelector('.plugin-main .red')?.textContent || ''"),
      { timeout: 30000 },
    ).toContain('HOT-RELOADED');

    expect(await page.evaluate(() => document.querySelectorAll('webview').length)).toBe(1);
    const webviewIdAfter = await page.evaluate(() => document.querySelector('webview').getWebContentsId());
    expect(webviewIdAfter).toBe(webviewIdBefore);

    await runInGuest(`
      const input = document.querySelector('.plugin-main input');
      input.focus();
      document.execCommand('insertText', false, 'still-alive');
      input.value;
    `);
    await expect.poll(
      async () => runInGuest("document.querySelector('.plugin-main .red')?.textContent || ''"),
    ).toContain('still-alive');
  });
});
