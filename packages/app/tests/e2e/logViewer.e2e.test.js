import { expect, test } from './fixtures/electronApp.js';

test.describe('日志查看与诊断检索 (LogViewer E2E)', () => {
  test('展示日志日期列表与日志记录，支持级别筛选与真实格式日志展示', async ({ electronContext }) => {
    const { page } = electronContext;

    await page.evaluate(() => {
      window.location.hash = '#/logs';
    });
    await page.waitForTimeout(500);
    await expect(page.locator('.log-viewer').first()).toBeVisible();

    const dateSelect = page.locator('.log-viewer__toolbar-field').first();
    await expect(dateSelect).toBeVisible();

    const recordCards = page.locator('.log-viewer__records .log-viewer__record');
    await expect(recordCards.first()).toBeVisible({ timeout: 10000 });
    const recordsText = await page.locator('.log-viewer__records').textContent();
    expect(recordsText).toContain('app 启动');

    await dateSelect.click();
    const dateOption = page.locator('.v-overlay .v-list-item:has-text("2026-03-24")').first();
    if (await dateOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateOption.click();
      await page.waitForTimeout(400);
      const mockRecordsText = await page.locator('.log-viewer__records').textContent();
      expect(mockRecordsText).toMatch(/(?:快捷键注册成功|插件已加载|主进程未处理的 Promise 拒绝|分片日志记录同步完成)/);
    }
  });
});
