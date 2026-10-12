import {
  beforeEach, describe, expect, it,
} from 'vitest';
import createSyncService from '../../src/utils/sync/sync-service';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';

let configStore;

const createService = () => createSyncService({
  pluginId: PLUGIN_ID,
  getConfig: (key, defaultValue) => (configStore.has(key) ? configStore.get(key) : defaultValue),
  setConfig: (key, value) => {
    configStore.set(key, value);
  },
  resolveBackupRoot: async () => 'C:/backup-root',
});

const localTargetsKey = `plugin.${PLUGIN_ID}.settings.syncLocalTargets`;

describe('sync-service 本地 / 网络路径条目', () => {
  beforeEach(() => {
    configStore = new Map();
  });

  it('添加的本地路径出现在同步配置中，与其他存档位置并列切换', async () => {
    const service = createService();
    await service.addLocalTarget('D:\\Backups\\Steam');

    expect(service.getSyncConfig().localTargets).toEqual(['D:\\Backups\\Steam']);
    expect(configStore.get(localTargetsKey)).toEqual(['D:\\Backups\\Steam']);
  });

  it('重复添加同一路径被拒绝（Windows 大小写不敏感）', async () => {
    // 防止回归：重复条目会让下拉出现多个同路径项，切换语义混乱
    const service = createService();
    await service.addLocalTarget('D:\\Backups\\Steam');

    await expect(service.addLocalTarget('d:\\backups\\steam')).rejects.toThrow('已添加');
    expect(service.getSyncConfig().localTargets).toHaveLength(1);
  });

  it('移除条目后不再出现在配置中；移除不存在的条目视为已完成', async () => {
    const service = createService();
    await service.addLocalTarget('D:\\Backups');
    await service.addLocalTarget('\\\\NAS\\share\\saves');

    service.removeLocalTarget('d:\\backups');
    expect(service.getSyncConfig().localTargets).toEqual(['\\\\NAS\\share\\saves']);

    service.removeLocalTarget('E:\\not-added');
    expect(service.getSyncConfig().localTargets).toEqual(['\\\\NAS\\share\\saves']);
  });

  it('重命名条目保持列表位置，旧路径消失', async () => {
    const service = createService();
    await service.addLocalTarget('D:\\Backups');
    await service.addLocalTarget('E:\\Saves');

    await service.renameLocalTarget('D:\\Backups', 'D:\\Games\\Backups');

    expect(service.getSyncConfig().localTargets).toEqual(['D:\\Games\\Backups', 'E:\\Saves']);
  });

  it('重命名到已存在的路径被拒绝，列表保持不变', async () => {
    const service = createService();
    await service.addLocalTarget('D:\\Backups');
    await service.addLocalTarget('E:\\Saves');

    await expect(service.renameLocalTarget('D:\\Backups', 'e:\\saves')).rejects.toThrow('已添加');
    expect(service.getSyncConfig().localTargets).toEqual(['D:\\Backups', 'E:\\Saves']);
  });

  it('损坏的存储数据（非数组或含非字符串项）被过滤，不致命', async () => {
    // 防止回归：手工编辑或旧版本残留的脏数据不应让设置页崩溃
    configStore.set(localTargetsKey, ['D:\\ok', 42, null, '  ', 'E:\\fine']);
    const service = createService();

    expect(service.getSyncConfig().localTargets).toEqual(['D:\\ok', 'E:\\fine']);
  });

  it('旧版本配置中手填的本地路径 target 自动转入 localTargets，平滑升级为可管理条目', async () => {
    // 防止回归：历史直接填在 target 中的本地路径若不收录，会在界面上丢失且无法删除
    configStore.set(`plugin.${PLUGIN_ID}.settings.sync`, {
      target: 'D:\\Legacy\\Backups',
      rclonePath: '',
    });
    const service = createService();

    expect(service.getSyncConfig().localTargets).toEqual(['D:\\Legacy\\Backups']);
    expect(configStore.get(localTargetsKey)).toEqual(['D:\\Legacy\\Backups']);
  });
});
