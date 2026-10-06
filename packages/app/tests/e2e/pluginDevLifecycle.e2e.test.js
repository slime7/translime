import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures/electronApp';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const mockDistDir = path.resolve(dirname, '../mocks/plugins/translime-plugin-mock-test/dist');

test.describe('开发插件构建产物生命周期 (Dev Plugin Build Lifecycle E2E)', () => {
  test.use({ devPluginScenario: true });

  test('启用的开发插件产物缺失时保持启用并提示需要构建，重建产物后重启恢复', async ({ electronContext }) => {
    test.setTimeout(120000);
    const { page, userDataDir } = electronContext;

    const pluginCard = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-dev-e2e"]').first();
    const disableBtn = pluginCard.locator('[data-test="plugin-disable-btn"]');

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 15000 });

    // 阶段一：正常状态——开发插件可见、可用、可打开
    await expect(pluginCard).toBeVisible({ timeout: 15000 });
    await expect(pluginCard).toContainText('本地开发');
    await expect(disableBtn).toBeVisible();

    const pluginDir = path.join(userDataDir, 'plugins_dev', 'node_modules', 'translime-plugin-dev-e2e');
    const distDir = path.join(pluginDir, 'dist');
    const entryPath = path.join(distDir, 'index.cjs.js');

    // 阶段二：构建产物缺失（仅删主进程入口，dist 目录保留）——宿主监听 dist
    // 变化自动重启，重启从磁盘重读后进入 build-missing
    fs.rmSync(entryPath);
    await expect(pluginCard).toContainText('需要构建', { timeout: 20000 });
    // 关键回归：产物缺失只代表当前不可用，不得把启用状态翻转为停用，
    // 否则 dist 监听与右键重启等自愈路径全部失效，重建产物后无法恢复
    await expect(disableBtn).toBeVisible();
    await expect(pluginCard.locator('[data-test="plugin-enable-btn"]')).toHaveCount(0);

    // 阶段三：重新构建（dist 目录整体重建，与真实构建工具清空目录的行为一致）。
    // 目录被删后监听器失效，自动恢复不可用，需手动「重启插件」——
    // 重启从磁盘重读清单与产物，修复后的产物由此生效
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.cpSync(mockDistDir, distDir, { recursive: true });

    await pluginCard.locator('[data-test="plugin-menu-btn"]').first().click();
    const restartItem = page.getByRole('menuitem', { name: '重启插件' }).first();
    await expect(restartItem).toBeVisible({ timeout: 8000 });
    await restartItem.click();

    await expect(pluginCard).not.toContainText('需要构建', { timeout: 15000 });
    await expect(pluginCard.locator('[data-test="plugin-open-btn"]')).toBeVisible({ timeout: 10000 });
    await expect(disableBtn).toBeVisible();
  });
});
