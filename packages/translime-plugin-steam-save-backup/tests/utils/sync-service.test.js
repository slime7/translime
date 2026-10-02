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
  enabled: true,
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

  it('同步未启用时拒绝删除且不触发任何 rclone 调用', async () => {
    // 防止回归：未配置远程目标时误执行远端删除
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, { ...SYNC_SETTINGS, enabled: false });

    await expect(createService().removeRemoteBackup({ gameId: '123', dir: 'ts1' }))
      .rejects.toThrow('同步未启用或未配置远程目标');

    expect(execCalls).toEqual([]);
  });
});
