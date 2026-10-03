import { describe, expect, it } from 'vitest';
import cleanupCustomDirBackups from '../../src/utils/custom-dir-removal';
// 可注入的假备份集：id 为目录名，info 为备份元数据
const makeDeps = (backups, overrides = {}) => {
  const calls = {
    infoReadOrder: [],
    localDeleted: [],
    remoteDeleted: [],
    remoteInfos: [],
  };
  const deps = {
    gameId: 'custom-game-1',
    deleteBackups: false,
    deleteRemote: false,
    listBackups: async () => backups,
    readBackupInfo: async (backup) => {
      calls.infoReadOrder.push(backup.id);
      return { backupTime: `${backup.id}-time`, createdBy: 'tester' };
    },
    deleteLocalBackup: async (backup) => {
      calls.localDeleted.push(backup.id);
      return { success: true };
    },
    deleteRemoteBackup: async ({ dir, info }) => {
      calls.remoteDeleted.push(dir);
      calls.remoteInfos.push(info);
    },
    ...overrides,
  };
  return { deps, calls };
};

describe('cleanupCustomDirBackups', () => {
  it('两个开关都关闭时不做任何清理（默认移除只解除绑定）', async () => {
    const { deps, calls } = makeDeps([{ id: 'ts1', path: 'p1' }]);
    const result = await cleanupCustomDirBackups(deps);

    expect(result).toEqual({ removedBackups: 0, remoteDeleted: false, warnings: [] });
    expect(calls.localDeleted).toEqual([]);
    expect(calls.remoteDeleted).toEqual([]);
  });

  it('仅删本地：逐份删除且不触碰远端', async () => {
    const { deps, calls } = makeDeps(
      [{ id: 'ts1', path: 'p1' }, { id: 'ts2', path: 'p2' }],
      { deleteBackups: true },
    );
    const result = await cleanupCustomDirBackups(deps);

    expect(result.removedBackups).toBe(2);
    expect(result.remoteDeleted).toBe(false);
    expect(calls.localDeleted).toEqual(['ts1', 'ts2']);
    expect(calls.remoteDeleted).toEqual([]);
  });

  it('仅删远端：本机备份保持原样，远端逐份写墓碑且携带删除前读取的原信息', async () => {
    const { deps, calls } = makeDeps(
      [{ id: 'ts1', path: 'p1' }],
      { deleteRemote: true },
    );
    const result = await cleanupCustomDirBackups(deps);

    expect(result.removedBackups).toBe(0);
    expect(result.remoteDeleted).toBe(true);
    expect(calls.localDeleted).toEqual([]);
    expect(calls.remoteDeleted).toEqual(['ts1']);
    expect(calls.remoteInfos[0]).toEqual({ backupTime: 'ts1-time', createdBy: 'tester' });
  });

  it('同时删除：远端墓碑的 info 在本地删除之前读取（删除后原信息不可再读）', async () => {
    const readOrder = [];
    const { deps } = makeDeps(
      [{ id: 'ts1', path: 'p1' }],
      {
        deleteBackups: true,
        deleteRemote: true,
        readBackupInfo: async (backup) => {
          readOrder.push(`info:${backup.id}`);
          return { backupTime: 't' };
        },
        deleteLocalBackup: async (backup) => {
          readOrder.push(`local:${backup.id}`);
          return { success: true };
        },
      },
    );
    const result = await cleanupCustomDirBackups(deps);

    expect(result.removedBackups).toBe(1);
    expect(result.remoteDeleted).toBe(true);
    expect(readOrder).toEqual(['info:ts1', 'local:ts1']);
  });

  it('单份本地删除失败时跳过该份并继续处理剩余（best-effort，失败计入告警）', async () => {
    const { deps, calls } = makeDeps(
      [{ id: 'ts1', path: 'p1' }, { id: 'ts2', path: 'p2' }],
      {
        deleteBackups: true,
        deleteRemote: true,
        deleteLocalBackup: async (backup) => (backup.id === 'ts1'
          ? { success: false, message: '文件被占用' }
          : { success: true }),
      },
    );
    const result = await cleanupCustomDirBackups(deps);

    expect(result.removedBackups).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('ts1');
    expect(result.warnings[0]).toContain('文件被占用');
    // 失败份不写远端墓碑（远端保留完整备份，与本机状态一致）
    expect(calls.remoteDeleted).toEqual(['ts2']);
  });

  it('远端删除失败计入告警但不影响本地删除（下次移除可重试）', async () => {
    const { deps } = makeDeps(
      [{ id: 'ts1', path: 'p1' }],
      {
        deleteBackups: true,
        deleteRemote: true,
        deleteRemoteBackup: async () => {
          throw new Error('rclone 超时');
        },
      },
    );
    const result = await cleanupCustomDirBackups(deps);

    expect(result.removedBackups).toBe(1);
    expect(result.remoteDeleted).toBe(false);
    expect(result.warnings[0]).toContain('rclone 超时');
  });
});
