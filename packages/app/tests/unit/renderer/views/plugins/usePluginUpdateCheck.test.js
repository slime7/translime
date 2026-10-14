import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import useGlobalStore from '@/store/globalStore';
import checkPluginUpdates from '@/views/plugins/hooks/usePluginUpdateCheck';

vi.mock('@/hooks/useAlert', () => ({
  default: () => ({
    show: vi.fn(),
  }),
}));

vi.mock('@/utils', () => ({
  appConfigStore: {
    get: vi.fn(async (key, fallback) => fallback),
    set: vi.fn(async () => undefined),
  },
}));

vi.mock('@/hooks/electron', () => ({
  useIpc: () => ({
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
    detach: vi.fn(),
  }),
}));

const { httpGetMock, httpUrls } = vi.hoisted(() => ({
  httpGetMock: vi.fn(),
  httpUrls: [],
}));

vi.mock('@/hooks/useHttp', () => ({
  default: (url) => {
    const urlText = String(url);
    httpUrls.push(urlText);
    return {
      get: () => httpGetMock(urlText),
    };
  },
}));

const packument = (packageName, versions) => ({
  name: packageName,
  'dist-tags': { latest: versions[versions.length - 1] },
  versions: Object.fromEntries(versions.map((version) => [
    version,
    {
      name: packageName,
      version,
      author: { name: 'slime7' },
      plugin: { title: packageName, description: `${packageName} 描述` },
    },
  ])),
});

describe('checkPluginUpdates', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    httpUrls.length = 0;
    httpGetMock.mockReset();
  });

  it('为非 dev 已安装插件拉取市场详情并写入版本列表', async () => {
    // 防止的回归：更新检查漏写 versions，已安装卡片的升级入口永远不出现
    const store = useGlobalStore();
    store.setPlugins([{ packageName: 'translime-plugin-a', version: '1.0.0' }]);
    httpGetMock.mockResolvedValue(packument('translime-plugin-a', ['1.0.0', '1.0.1']));

    checkPluginUpdates();
    await flushPromises();
    await flushPromises();

    expect(httpGetMock).toHaveBeenCalledTimes(1);
    expect(httpUrls[0]).toContain('https://registry.npmjs.org/translime-plugin-a');
    expect(store.plugins[0].versions.map((item) => item.value)).toEqual(['1.0.1', '1.0.0']);
  });

  it('dev 插件跳过更新检查', async () => {
    // 防止的回归：本地开发插件在市场中不存在，检查请求必然失败并报错
    const store = useGlobalStore();
    store.setPlugins([{ packageName: 'translime-plugin-dev', version: '1.0.0', dev: true }]);

    checkPluginUpdates();
    await flushPromises();

    expect(httpGetMock).not.toHaveBeenCalled();
    expect(store.plugins[0].versions).toBeUndefined();
  });

  it('单个插件检查失败不影响其他插件的版本写入', async () => {
    // 防止的回归：一个包的注册表请求失败把整个检查打断，其余插件丢失升级提示
    const store = useGlobalStore();
    store.setPlugins([
      { packageName: 'translime-plugin-a', version: '1.0.0' },
      { packageName: 'translime-plugin-b', version: '1.0.0' },
    ]);
    httpGetMock.mockImplementation(async (url) => {
      if (url.includes('translime-plugin-a')) {
        throw new Error('registry down');
      }
      return packument('translime-plugin-b', ['1.0.0', '1.0.1']);
    });

    checkPluginUpdates();
    await flushPromises();
    await flushPromises();

    expect(store.plugins[0].versions).toBeUndefined();
    expect(store.plugins[1].versions.map((item) => item.value)).toEqual(['1.0.1', '1.0.0']);
  });
});
