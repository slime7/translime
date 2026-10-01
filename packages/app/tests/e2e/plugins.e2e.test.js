import { expect, test } from './fixtures/electronApp';

test.describe('插件生态与管理交互 (Plugins E2E)', () => {
  test('正常发现注入的测试插件，支持搜索过滤与启用/禁用状态切换', async ({ electronContext }) => {
    const { navigateTo, page } = electronContext;

    await navigateTo('PluginCenter');
    await expect(page.locator('.plugin-center').first()).toBeVisible();

    const pluginCard = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"]').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });
    await expect(pluginCard).toContainText('Mock plugin for testing');

    const searchInput = page.locator('[data-test="plugin-search-input"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('mock-test');
      await page.waitForTimeout(300);
      await expect(pluginCard).toBeVisible();
    }

    const enableBtn = pluginCard.locator('[data-test="plugin-enable-btn"]').first();
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      const disableBtn = pluginCard.locator('[data-test="plugin-disable-btn"]').first();
      await expect(disableBtn).toBeVisible({ timeout: 8000 });

      await disableBtn.click();
      await expect(enableBtn).toBeVisible({ timeout: 8000 });
    }
  });

  test('搜索栏与操作按钮保持单行布局且中间不出现空档', async ({ electronContext }) => {
    const { app, page } = electronContext;

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 10000 });

    // 缩小窗口宽度到此前会触发搜索行换行/空档的尺寸
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html'));
      if (win) {
        win.setSize(720, 600);
      }
    });
    await page.waitForTimeout(600);

    const searchBox = page.locator('[data-test="plugin-search-input"]').first();
    const installLocalBtn = page.locator('[data-test="plugin-install-local-btn"]').first();
    const refreshBtn = page.locator('[data-test="plugin-refresh-btn"]').first();
    await expect(searchBox).toBeVisible();
    await expect(installLocalBtn).toBeVisible();
    await expect(refreshBtn).toBeVisible();

    const searchRect = await searchBox.boundingBox();
    const installRect = await installLocalBtn.boundingBox();
    const refreshRect = await refreshBtn.boundingBox();

    // 防止的回归：搜索行使用 flex-wrap + spacer，窄窗口下按钮换行并在行中留出大空档。
    // 搜索框与两个操作按钮必须仍在同一行
    expect(Math.abs(searchRect.y - installRect.y)).toBeLessThan(16);
    expect(Math.abs(searchRect.y - refreshRect.y)).toBeLessThan(16);
    // 搜索框右缘与第一个按钮左缘之间不允许出现大空档。
    // 阈值需覆盖 mat-search 输入框元素盒右侧的内边距（元素盒宽于视觉胶囊），
    // “按钮换行/行中出现大片空白”由上方 y 轴同行断言保证
    expect(installRect.x - (searchRect.x + searchRect.width)).toBeLessThan(96);
  });

  test('首次进入插件页面时应显示插件标题栏', async ({ electronContext }) => {
    const { page } = electronContext;

    const openBtn = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"] [data-test="plugin-open-btn"]').first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // 防止的回归：pageTransitionActive 因路由过渡 after-enter 偶发未触发而停留 true，
    // 首次进入插件页面时标题栏一直不显示
    const titleBar = page.locator('[data-test="plugin-title-bar"]').first();
    await expect(titleBar).toBeVisible({ timeout: 10000 });
    await expect(titleBar).toContainText('Mock');
  });

  test('搜索只作用于当前页签且不自动切换，市场页签留空列出全部插件', async ({ electronContext }) => {
    const { page } = electronContext;

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 10000 });
    const pluginCard = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"]').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });

    const searchTab = page.locator('[data-test="plugin-tab-search"]').first();
    const searchInput = page.locator('[data-test="plugin-search-input"]').first();
    // 市场页签的空态占位：仅在尚未进入浏览模式时显示
    const marketSplash = page.getByText('在上方输入关键词搜索插件市场').first();

    // 已安装页签：输入无匹配关键词，回车后必须停留在当前页签
    await searchInput.fill('zzz-no-match');
    const noMatchHint = page.getByText('没有匹配的已安装插件').first();
    await expect(noMatchHint).toBeVisible({ timeout: 5000 });
    await searchInput.press('Enter');
    // 防止的回归：回车搜索自动切到市场页签，把用户从正在过滤的列表拽走
    await expect(noMatchHint).toBeVisible({ timeout: 3000 });

    // 退格清空：已安装列表由本地即时过滤自然恢复
    await searchInput.press('Control+a');
    await searchInput.press('Backspace');
    await expect(pluginCard).toBeVisible({ timeout: 5000 });

    // 市场页签：进入即以空关键词进入浏览模式列出全部插件，空态占位被结果区替换
    await searchTab.click();
    await expect(marketSplash).not.toBeVisible({ timeout: 8000 });
    await expect(pluginCard).not.toBeVisible();

    // 市场页签内回车查询与清空文本都停留在市场页签，清空后回到浏览模式
    await searchInput.fill('mock');
    await searchInput.press('Enter');
    await searchInput.press('Control+a');
    await searchInput.press('Backspace');
    // 防止的回归：清空搜索自动跳回已安装页签
    await expect(pluginCard).not.toBeVisible({ timeout: 3000 });
    await expect(marketSplash).not.toBeVisible();
  });

  test('未激活的插件也能直接打开配置面板并渲染设置项', async ({ electronContext }) => {
    const { page } = electronContext;

    await page.locator('.plugin-center').first().waitFor({ state: 'visible', timeout: 10000 });
    const pluginCard = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"]').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });

    // mock 插件声明 onView 激活，此时从未激活；设置项属于声明式元数据，
    // 打开卡片菜单时应延迟加载入口的 settingMenu（不触发激活）
    const menuBtn = pluginCard.locator('[data-test="plugin-menu-btn"]').first();
    await menuBtn.click();
    const menuItem = page.getByRole('menuitem', { name: '设置' }).first();
    await expect(menuItem).toBeVisible({ timeout: 8000 });
    await menuItem.click();

    // 防止的回归：settingMenu 在激活时才合并进主进程插件对象，若菜单不
    // 延迟加载元数据、或面板打开前不刷新渲染端数据，配置面板会渲染成只有
    // 提示文案的空面板
    const settingDialog = page.locator('[data-test="plugin-setting-dialog"]').first();
    await expect(settingDialog).toBeVisible({ timeout: 8000 });
    await expect(settingDialog).toContainText('文本1', { timeout: 8000 });
    await expect(settingDialog).toContainText('下拉菜单');
    await expect(settingDialog).toContainText('文件选择1');
  });

  test('插件搜索框右键应弹出文本编辑菜单', async ({ electronContext }) => {
    const { page, navigateTo } = electronContext;

    await navigateTo('PluginCenter');
    const searchInput = page.locator('[data-test="plugin-search-input"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // 防止的回归：搜索框从 mat-text-field 迁移到 mat-search 时丢失了
    // @contextmenu 绑定，文本输入框右键不再有撤销/复制/粘贴菜单
    await searchInput.click({ button: 'right' });

    const menu = page.locator('[role="menu"]').first();
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('撤销');
    await expect(menu).toContainText('粘贴');

    await menu.getByText('重做').click();
    await expect(menu).not.toBeVisible();
  });
});
