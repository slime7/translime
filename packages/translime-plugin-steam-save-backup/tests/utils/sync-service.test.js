import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import createSyncService from '../../src/utils/sync/sync-service';

const { execCalls, fakeExec } = vi.hoisted(() => {
  const calls = [];
  const exec = Object.assign(
    async (args) => {
      calls.push(args);
      return { code: 0, stdout: '', stderr: '' };
    },
    { killAll: vi.fn() },
  );
  return { execCalls: calls, fakeExec: exec };
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

  it('setSyncConfig 支持单独更新 rclone 路径，保持既有 target 不变并同步顶层设置', () => {
    // 防止回归：单独修改 rclonePath 时若冲掉 target，用户在重新指定 rclone 后已有远程目标会丢失
    const service = createService();
    service.setSyncConfig({ target: 'smb:share', rclonePath: 'rclone' });

    service.setSyncConfig({ rclonePath: '/custom/bin/rclone' });

    const { config } = service.getStatus();
    expect(config).toEqual({ target: 'smb:share', rclonePath: '/custom/bin/rclone' });
    expect(configStore.get(`plugin.${PLUGIN_ID}.settings.rclonePath`)).toBe('/custom/bin/rclone');
  });

  it('readSyncConfig 兼容回退读取宿主顶层 settingMenu 保存的 rclonePath', () => {
    // 防止回归：用户在宿主插件设置面板配置了 rclonePath，但同步配置中未显式设置时，应正确继承
    configStore.set(`plugin.${PLUGIN_ID}.settings`, {
      rclonePath: ['/usr/bin/rclone'],
    });

    const service = createService();
    const { config } = service.getStatus();
    expect(config.rclonePath).toBe('/usr/bin/rclone');
  });
});

describe('sync-service 远端删除墓碑', () => {
  beforeEach(() => {
    execCalls.length = 0;
    fakeExec.killAll.mockClear();
    configStore = new Map();
  });

  it('removeRemoteBackup 在 purge 后以 copyto 写入墓碑元数据（其他端据此跟随删除）', async () => {
    // 防止回归：删除远程退化为纯 purge 会让其他端在下次对账时把已删备份回补/重新上传
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, SYNC_SETTINGS);

    await createService().removeRemoteBackup({
      gameId: '123',
      dir: 'ts1',
      info: { schemaVersion: 2, gameId: '123', backupTime: '2026-10-01T10:00:00.000Z' },
    });

    expect(execCalls).toContainEqual(['purge', 'GDrive:translime-saves/123/ts1']);
    const copyto = execCalls.find((args) => args[0] === 'copyto');
    expect(copyto).toBeTruthy();
    expect(copyto[2].replaceAll('\\', '/')).toBe('GDrive:translime-saves/123/ts1/info.json');
  });
});

describe('sync-service 直通对账接线', () => {
  beforeEach(() => {
    execCalls.length = 0;
    fakeExec.killAll.mockClear();
    configStore = new Map();
  });

  it('触发对账时附带执行直通服务对账，并共享 exec 与目标（单队列约束）', async () => {
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, SYNC_SETTINGS);
    const runSyncCalls = [];
    const passthrough = {
      runSync: async (args) => {
        runSyncCalls.push(args);
        return null;
      },
      getStatus: () => ({ entryCount: 1 }),
    };

    const service = createService();
    service.setPassthrough(passthrough);
    // trigger 是即发即忘：等到队列回到 idle（对账含直通对账都已结束）再断言
    service.trigger();
    await vi.waitFor(() => {
      expect(service.getStatus().phase).toBe('idle');
    });

    expect(runSyncCalls).toEqual([{
      exec: fakeExec,
      target: SYNC_SETTINGS.target,
      isCancelled: expect.any(Function),
    }]);
  });

  it('getStatus 透传直通状态，未接入直通时为 null', async () => {
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, SYNC_SETTINGS);

    const bare = createService();
    expect(bare.getStatus().passthrough).toBe(null);

    const service = createService();
    service.setPassthrough({ runSync: async () => null, getStatus: () => ({ entryCount: 2 }) });
    expect(service.getStatus().passthrough).toEqual({ entryCount: 2 });
  });
});

describe('sync-service 墓碑冲突处置', () => {
  let backupRoot;

  const createServiceWithRoot = () => createSyncService({
    pluginId: PLUGIN_ID,
    getConfig: (key, defaultValue) => (configStore.has(key) ? configStore.get(key) : defaultValue),
    setConfig: (key, value) => {
      configStore.set(key, value);
    },
    resolveBackupRoot: async () => backupRoot,
  });

  beforeEach(async () => {
    execCalls.length = 0;
    fakeExec.killAll.mockClear();
    configStore = new Map();
    backupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tomb-conflict-'));
  });

  afterEach(async () => {
    await fs.rm(backupRoot, { recursive: true, force: true });
  });

  const seedTombstoneConflict = () => {
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, SYNC_SETTINGS);
    configStore.set(`plugin.${PLUGIN_ID}.syncState`, {
      machineId: 'machine-1',
      dirtyGames: [],
      conflicts: [{
        gameId: '123',
        dir: 'ts1',
        kind: 'tombstone',
        remoteKind: 'zip',
        remote: { deletedAt: '2026-10-02T00:00:00.000Z' },
      }],
      lastReport: null,
      lastError: null,
      lastRunAt: null,
    });
  };

  it('confirm-deletion：移除本地备份目录并清除冲突条目（远端墓碑保持）', async () => {
    seedTombstoneConflict();
    const localDir = path.join(backupRoot, '123', 'ts1');
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(localDir, 'keep.dat'), 'x', 'utf8');

    const service = createServiceWithRoot();
    const status = await service.resolveOneConflict({ gameId: '123', dir: 'ts1', mode: 'confirm-deletion' });

    expect(await fs.stat(localDir).catch(() => null)).toBe(null);
    expect(status.conflicts).toEqual([]);
  });

  it('墓碑冲突不接受内容冲突的三选一处理方式', async () => {
    seedTombstoneConflict();

    const service = createServiceWithRoot();
    await expect(service.resolveOneConflict({ gameId: '123', dir: 'ts1', mode: 'keep-both' }))
      .rejects.toThrow('远端已删除的备份仅支持');
  });

  it('confirm-deletion 不适用于普通内容冲突', async () => {
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, SYNC_SETTINGS);
    configStore.set(`plugin.${PLUGIN_ID}.syncState`, {
      machineId: 'machine-1',
      dirtyGames: [],
      conflicts: [{ gameId: '123', dir: 'ts1', remoteKind: 'zip' }],
      lastReport: null,
      lastError: null,
      lastRunAt: null,
    });

    const service = createServiceWithRoot();
    await expect(service.resolveOneConflict({ gameId: '123', dir: 'ts1', mode: 'confirm-deletion' }))
      .rejects.toThrow('仅适用于远端删除冲突');
  });
});
