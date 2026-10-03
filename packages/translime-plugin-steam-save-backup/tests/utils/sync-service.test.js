import { beforeEach, describe, expect, it, vi } from 'vitest';
import createSyncService from '../../src/utils/sync/sync-service';

const { execCalls, fakeExec } = vi.hoisted(() => {
  const execCalls = [];
  const fakeExec = Object.assign(
    async (args) => {
      execCalls.push(args);
      return { code: 0, stdout: '', stderr: '' };
    },
    { killAll: vi.fn() },
  );
  return { execCalls, fakeExec };
});

// mock 掉 rclone 进程探测与执行；引擎依赖的 isRemoteNotFound / tailOutput 保留真实实现
vi.mock('../../src/utils/sync/rclone', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    probeRclone: vi.fn(async () => ({
      ok: true, version: '1.66.0', path: 'fake-rclone', error: null,
    })),
    createExec: vi.fn(() => fakeExec),
  };
});

const PLUGIN_ID = 'translime-plugin-steam-save-backup';
const SYNC_SETTINGS = {
  target: 'GDrive:translime-saves',
  rclonePath: 'C:/tools/rclone.exe',
};

let configStore;

const createService = () => createSyncService({
  pluginId: PLUGIN_ID,
  getConfig: (key, defaultValue) => (configStore.has(key) ? configStore.get(key) : defaultValue),
  setConfig: (key, value) => {
    configStore.set(key, value);
  },
  resolveBackupRoot: async () => 'C:/backup-root',
});

describe('sync-service removeRemoteBackup', () => {
  beforeEach(() => {
    execCalls.length = 0;
    fakeExec.killAll.mockClear();
    configStore = new Map();
  });

  it('以正确的 target/gameId/dir 执行远端 purge，并联动移除该目录的冲突条目', async () => {
    // 防止回归：service 与 engine 的参数形状错位（对象参数传给位置参数签名）
    // 会让 target 变成 undefined，"同时删除远程存档"必然抛 TypeError 且远端永不删除
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, SYNC_SETTINGS);
    configStore.set(`plugin.${PLUGIN_ID}.syncState`, {
      machineId: 'machine-1',
      dirtyGames: [],
      conflicts: [
        { gameId: '123', dir: 'ts1', remoteKind: 'zip' },
        { gameId: '456', dir: 'ts1', remoteKind: 'zip' },
      ],
      lastReport: null,
      lastError: null,
      lastRunAt: null,
    });

    await createService().removeRemoteBackup({ gameId: '123', dir: 'ts1' });

    expect(execCalls).toContainEqual(['purge', 'GDrive:translime-saves/123/ts1']);
    // 删除后仅清理对应目录的冲突条目，其他游戏的冲突保持待处理
    const { conflicts } = configStore.get(`plugin.${PLUGIN_ID}.syncState`);
    expect(conflicts).toEqual([{ gameId: '456', dir: 'ts1', remoteKind: 'zip' }]);
    expect(fakeExec.killAll).toHaveBeenCalled();
  });

  it('未配置远程目标时拒绝删除且不触发任何 rclone 调用', async () => {
    // 防止回归：未配置远程目标时误执行远端删除
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, { target: '', rclonePath: '' });

    await expect(createService().removeRemoteBackup({ gameId: '123', dir: 'ts1' }))
      .rejects.toThrow('未配置远程目标');

    expect(execCalls).toEqual([]);
  });
});

describe('sync-service 手动同步', () => {
  beforeEach(() => {
    execCalls.length = 0;
    fakeExec.killAll.mockClear();
    configStore = new Map();
  });

  it('markDirty 记录待上传游戏且不触发任何 rclone 调用（备份后不再自动推送远端）', async () => {
    // 防止回归：多台本地各自与远端对账时，备份后自动上传会把其他机器已删除的远端备份传回来
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, SYNC_SETTINGS);

    const service = createService();
    service.markDirty('1245620');
    service.markDirty('1245620');

    expect(configStore.get(`plugin.${PLUGIN_ID}.syncState`).dirtyGames).toEqual(['1245620']);
    expect(execCalls).toEqual([]);
  });

  it('未配置远程目标时 trigger 被忽略，不启动 rclone', async () => {
    const service = createService();

    expect(service.trigger()).toBe('ignored');
    expect(execCalls).toEqual([]);
  });

  it('setSyncConfig 只持久化目标与 rclone 路径，状态不再携带 enabled', async () => {
    const service = createService();

    service.setSyncConfig({ target: '  GDrive:saves  ', rclonePath: 'rclone.exe' });

    const { config } = service.getStatus();
    expect(config).toEqual({ target: 'GDrive:saves', rclonePath: 'rclone.exe' });
  });
});
