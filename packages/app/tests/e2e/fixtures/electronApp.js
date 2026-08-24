import { test as base, _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { injectAllMocks } from '../../mocks/injectMockData';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appRootDir = path.resolve(dirname, '../../..');

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  electronContext: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'translime-e2e-'));
    injectAllMocks(userDataDir);

    const app = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`],
      cwd: appRootDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        IS_TEST: 'true',
      },
    });

    let mainWindow = app.windows().find((w) => w.url().includes('index.html'));
    if (!mainWindow) {
      mainWindow = await app.waitForEvent('window', {
        predicate: (w) => w.url().includes('index.html'),
        timeout: 15000,
      });
    }

    await mainWindow.waitForLoadState('domcontentloaded');
    await mainWindow.waitForSelector('#app', { state: 'attached', timeout: 15000 });

    const helpers = {
      app,
      page: mainWindow,
      userDataDir,
      async navigateTo(routeName) {
        const testIdSelectors = {
          Home: '[data-test="nav-home"]',
          Plugins: '[data-test="nav-plugins"]',
          Setting: '[data-test="nav-setting"]',
          LogViewer: '[data-test="about-open-log-btn"]',
          About: '[data-test="nav-about"]',
        };
        const selector = testIdSelectors[routeName];
        if (!selector) {
          throw new Error(`Unknown route name: ${routeName}`);
        }
        const navButton = mainWindow.locator(selector).first();
        if (await navButton.isVisible({ timeout: 4000 }).catch(() => false)) {
          await navButton.click();
        } else {
          const routeMap = {
            Home: '#/',
            Plugins: '#/plugins',
            Setting: '#/setting',
            LogViewer: '#/logs',
            About: '#/about',
          };
          await mainWindow.evaluate((hash) => {
            window.location.hash = hash;
          }, routeMap[routeName]);
        }
        await mainWindow.waitForTimeout(400);
      },
    };

    await use(helpers);

    try {
      await app.close();
    } catch {
      // 忽略关闭异常
    } finally {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // 忽略临时文件占用清理异常
      }
    }
  },
});

export { expect } from '@playwright/test';
