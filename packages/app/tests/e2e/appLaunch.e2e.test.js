import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/electronApp';

const appRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test.describe('应用启动与主窗口渲染 (App Launch E2E)', () => {
  test('启动后成功呈现主窗口并加载根容器', async ({ electronContext }) => {
    const { app, page } = electronContext;

    expect(page).toBeDefined();
    const title = await page.title();
    expect(title).toBeDefined();

    const appElement = page.locator('#app');
    await expect(appElement).toBeVisible();

    const pluginsNav = page.locator('[data-test="nav-plugins"]').first();
    await expect(pluginsNav).toBeVisible();

    const settingNav = page.locator('[data-test="nav-setting"]').first();
    await expect(settingNav).toBeVisible();

    const aboutNav = page.locator('[data-test="nav-about"]').first();
    await expect(aboutNav).toBeVisible();

    const isPackaged = await app.evaluate(({ app: electronMainApp }) => electronMainApp.isPackaged);
    expect(typeof isPackaged).toBe('boolean');
  });

  // 全新 userData（dev 独立数据目录、首次安装）启动时 plugins 目录层级均不存在，
  // 这里不注入任何 mock 数据，验证宿主能自行创建插件目录并正常启动
  test('空白 userData 首次启动时创建插件目录与默认清单', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translime-e2e-empty-'));
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      cwd: appRootDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        IS_TEST: 'true',
      },
    });

    try {
      const page = await app.waitForEvent('window', {
        predicate: (w) => w.url().includes('index.html'),
        timeout: 15000,
      });
      await page.waitForSelector('#app', { state: 'attached', timeout: 15000 });
      await expect(page.locator('[data-test="nav-plugins"]').first()).toBeVisible();

      expect(fs.existsSync(path.join(userDataDir, 'plugins', 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(userDataDir, 'plugins', 'package'))).toBe(true);
      expect(fs.existsSync(path.join(userDataDir, 'plugins_dev', 'node_modules'))).toBe(true);
    } finally {
      // 主进程异常退出时 close 可能不再返回，这里限定等待时间避免拖满测试超时
      await Promise.race([
        app.close().catch(() => {}),
        new Promise((resolve) => {
          setTimeout(resolve, 5000);
        }),
      ]);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
