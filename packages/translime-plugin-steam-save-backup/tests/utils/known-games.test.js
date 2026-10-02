import { describe, expect, it } from 'vitest';
import { listGhostGames, upsertKnownGames } from '../../src/utils/known-games';

const steamGame = (appid, name, savePaths = []) => ({
  appid,
  name,
  installDir: `C:/steam/common/${name}`,
  libraryPath: 'C:/steam',
  savePaths,
  saveSources: [{ files: ['save.dat'] }],
  backupCount: 0,
  excluded: false,
});

describe('upsertKnownGames', () => {
  it('登记扫描到游戏的云存档配置（appid 字符串键，保存名称与 savePaths）', () => {
    const known = upsertKnownGames({}, [steamGame('1245620', 'Hades', [{ root: 2 }])]);

    expect(known['1245620']).toEqual({
      appid: '1245620',
      name: 'Hades',
      savePaths: [{ root: 2 }],
    });
  });

  it('自定义游戏不登记（目录配置本就存放在 customSaveDirs）', () => {
    const custom = { ...steamGame('custom-hk', 'Hollow Knight'), isCustom: true };

    expect(upsertKnownGames({}, [custom])).toEqual({});
  });

  it('已安装游戏的实时扫描配置覆盖旧登记条目（不产生重复）', () => {
    const first = upsertKnownGames({}, [steamGame('1245620', 'Hades', [{ root: 2 }])]);
    const second = upsertKnownGames(first, [steamGame('1245620', 'Hades', [{ root: 4 }, { root: 2 }])]);

    expect(Object.keys(second)).toEqual(['1245620']);
    expect(second['1245620'].savePaths).toHaveLength(2);
  });

  it('不修改入参注册表（返回合并后的新对象）', () => {
    const original = Object.freeze({ 1: { appid: '1', name: 'A', savePaths: [] } });

    const merged = upsertKnownGames(original, [steamGame('2', 'B')]);

    expect(merged['1']).toEqual(original['1']);
    expect(merged['2']).toBeDefined();
  });
});

describe('listGhostGames', () => {
  const counts = { 1245620: 3, 413150: 0 };
  const getBackupCount = async (appid) => counts[appid] ?? 0;
  const known = {
    1245620: { appid: '1245620', name: 'Hades', savePaths: [{ root: 2 }] },
    413150: { appid: '413150', name: 'Stardew Valley', savePaths: [] },
    broken: null,
  };

  it('已卸载且本地仍有备份的登记游戏进入列表：saveSources 置空，仅保留管理能力；无备份的条目不展示', async () => {
    const ghosts = await listGhostGames(known, [], getBackupCount, '/backups');

    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({
      appid: '1245620',
      name: 'Hades',
      uninstalled: true,
      saveSources: [],
      backupCount: 3,
    });
    // Stardew Valley 已登记但本地无备份：没有管理对象，不进入列表
    expect(ghosts.some((game) => game.appid === '413150')).toBe(false);
  });

  it('仍已安装（在扫描结果中）的游戏不重复列出（实时扫描优先）', async () => {
    const ghosts = await listGhostGames(known, [steamGame('1245620', 'Hades')], getBackupCount, '/backups');

    expect(ghosts).toEqual([]);
  });
});
