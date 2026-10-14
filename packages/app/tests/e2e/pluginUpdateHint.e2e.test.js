import http from 'node:http';
import { expect, test } from './fixtures/electronApp';

// mock 插件已安装 1.0.0，市场提供 1.0.1：升级提示应在冷启动后直接出现
const packument = {
  name: 'translime-plugin-mock-test',
  'dist-tags': { latest: '1.0.1' },
  versions: {
    '1.0.0': {
      name: 'translime-plugin-mock-test',
      version: '1.0.0',
      author: { name: 'slime7' },
      plugin: { title: 'Mock Test Plugin', description: 'Mock plugin for testing' },
    },
    '1.0.1': {
      name: 'translime-plugin-mock-test',
      version: '1.0.1',
      author: { name: 'slime7' },
      plugin: { title: 'Mock Test Plugin', description: 'Mock plugin for testing' },
    },
  },
};

// 模块加载即启动本地包数据服务：端口在测试收集阶段确定，供 appConfig 注入。
// 更新检查走配置的 registry，避免依赖真实 npm 源
const registryServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(packument));
});
await new Promise((resolve) => {
  registryServer.listen(0, '127.0.0.1', resolve);
});
const registryPort = registryServer.address().port;

test.afterAll(async () => {
  await new Promise((resolve) => {
    registryServer.close(resolve);
  });
});

test.use({
  appConfig: { setting: { registry: `http://127.0.0.1:${registryPort}` } },
});

test.describe('插件更新提示 E2E', () => {
  test('冷启动后已安装卡片直接显示新版本升级按钮', async ({ electronContext }) => {
    const { page } = electronContext;

    const pluginCard = page.locator('[data-test="plugin-card"][data-test-package="translime-plugin-mock-test"]').first();
    await expect(pluginCard).toBeVisible({ timeout: 10000 });

    // 防止的回归：启动路径只拉取插件列表、不检查市场版本，升级入口要等
    // 切走再切回插件中心后才出现
    const upgradeBtn = pluginCard.locator('[data-test="plugin-upgrade-btn"]').first();
    await expect(upgradeBtn).toBeVisible({ timeout: 10000 });
  });
});
