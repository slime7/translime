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

test.describe('ESM 插件热重载 (Dev ESM Plugin Hot Reload E2E)', () => {
  test.use({ devPluginScenario: true, devPluginEsm: true });

  test('ESM 主进程入口产物变化后自动重启，重新 import 的模块生效且插件保持可用', async ({ electronContext }) => {
    test.setTimeout(120000);
    const { page, userDataDir } = electronContext;

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 15000 });
    const openBtn = page.locator(`[data-test="plugin-card"][data-test-package="${DEV_PLUGIN_ID}"] [data-test="plugin-open-btn"]`).first();
    await expect(openBtn).toBeVisible({ timeout: 15000 });
    await openBtn.click();

    // 在插件 webview 内调用宿主 IPC 通道，读取入口模块当前的 ENTRY_VERSION：
    // ESM 的缓存由 ESM loader 独立持有，只有宿主重新 import 才会拿到新模块，
    // 因此该返回值是“ESM 入口被重新求值”的直接证据
    const invokeTestIpc = () => page.evaluate((pluginId) => {
      const webview = document.querySelector('webview');
      if (!webview) {
        throw new Error('未找到插件 webview');
      }
      return webview.executeJavaScript(
        `window.electron.useIpc().invoke('test-ipc@${pluginId}', 'ping')`,
      );
    }, DEV_PLUGIN_ID);

    await expect.poll(
      async () => (await invokeTestIpc())?.version,
      { timeout: 30000 },
    ).toBe('v1');

    const webviewIdBefore = await page.evaluate(() => document.querySelector('webview').getWebContentsId());

    // 模拟 dev 构建产物落盘：ESM 入口版本号变化应触发自动重启并重新加载模块
    const distDir = path.join(userDataDir, 'plugins_dev', 'node_modules', DEV_PLUGIN_ID, 'dist');
    const mainPath = path.join(distDir, 'index.esm.js');
    fs.writeFileSync(
      mainPath,
      fs.readFileSync(mainPath, 'utf8').replace("ENTRY_VERSION = 'v1'", "ENTRY_VERSION = 'v2'"),
      'utf8',
    );

    await expect.poll(
      async () => (await invokeTestIpc())?.version,
      { timeout: 30000 },
    ).toBe('v2');

    // ESM 重启不得销毁重建 webview（与 CJS 热重载一致的原地重载语义）
    expect(await page.evaluate(() => document.querySelectorAll('webview').length)).toBe(1);
    const webviewIdAfter = await page.evaluate(() => document.querySelector('webview').getWebContentsId());
    expect(webviewIdAfter).toBe(webviewIdBefore);
  });
});
