import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  discoverRemoteGames,
  isRemoteGameAddedLocally,
} from '../../src/utils/sync/discover';

let tmpRoot;
let remoteRoot;
let target;
let stageDir;

const writeInfo = async (gameId, timestamp, info) => {
  const dir = path.join(remoteRoot, gameId, timestamp);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'info.json'), JSON.stringify(info), 'utf8');
};

// 模拟 rclone copy <target> <stage> --include /*/*/info.json：
// 只把远端 `<game>/<ts>/info.json` 复制进 stage（保持目录结构）
const makeFakeExec = () => async (args) => {
  const [cmd, src, dest] = args;
  if (cmd === 'copy' && src === target) {
    if (!(await fs.stat(remoteRoot).catch(() => null))) {
      return { code: 3, stdout: '', stderr: 'Directory not found.' };
    }
    const walk = async (dir, rel) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries.map(async (entry) => {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, entryRel);
          return;
        }
        const parts = entryRel.split('/');
        if (parts.length === 3 && parts[2] === 'info.json') {
          const destPath = path.join(dest, ...parts);
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(entryPath, destPath);
        }
      }));
    };
    await walk(remoteRoot, '');
    return { code: 0, stdout: '', stderr: '' };
  }
  return { code: 1, stdout: '', stderr: `unexpected command: ${args.join(' ')}` };
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'translime-discover-test-'));
  remoteRoot = path.join(tmpRoot, 'remote');
  stageDir = path.join(tmpRoot, 'stage');
  target = 'mock-remote:SteamBackups';
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('discoverRemoteGames', () => {
  it('按游戏分组远端备份，备份与游戏均按时间倒序', async () => {
    await writeInfo('1245620', '2026-10-01T10-00-00-000Z', {
      gameId: '1245620', gameName: 'Hades', backupTime: '2026-10-01T10:00:00.000Z', createdBy: 'aaaa1111', note: '首章',
    });
    await writeInfo('1245620', '2026-09-30T09-00-00-000Z', {
      gameId: '1245620', gameName: 'Hades', backupTime: '2026-09-30T09:00:00.000Z', createdBy: 'aaaa1111', note: '',
    });
    await writeInfo('custom-eldenring', '2026-09-28T21-30-00-000Z', {
      gameId: 'custom-eldenring', gameName: '艾尔登法环', backupTime: '2026-09-28T21:30:00.000Z', createdBy: 'bbbb2222', note: '',
    });

    const games = await discoverRemoteGames({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(games).toHaveLength(2);
    expect(games[0].gameId).toBe('1245620');
    expect(games[0].gameName).toBe('Hades');
    expect(games[0].backupCount).toBe(2);
    expect(games[0].latestBackupTime).toBe('2026-10-01T10:00:00.000Z');
    expect(games[0].backups.map((backup) => backup.dir)).toEqual([
      '2026-10-01T10-00-00-000Z',
      '2026-09-30T09-00-00-000Z',
    ]);
    expect(games[0].backups[0].note).toBe('首章');
    expect(games[1].gameName).toBe('艾尔登法环');
  });

  it('跳过远端删除墓碑与缺失元数据的残留目录', async () => {
    await writeInfo('1245620', '2026-10-01T10-00-00-000Z', {
      gameId: '1245620', gameName: 'Hades', backupTime: '2026-10-01T10:00:00.000Z', note: '',
    });
    // 墓碑：删除标记的备份不算可发现备份
    await writeInfo('1245620', '2026-09-30T09-00-00-000Z', {
      gameId: '1245620', gameName: 'Hades', backupTime: '2026-09-30T09:00:00.000Z', note: '', deleted: true, deletedAt: '2026-10-02T00:00:00.000Z',
    });
    // 传输中断残留：目录存在但缺 info.json，或 info.json 无法解析
    await fs.mkdir(path.join(remoteRoot, '413150', '2026-09-29T08-00-00-000Z'), { recursive: true });
    const brokenDir = path.join(remoteRoot, '413150', '2026-09-28T08-00-00-000Z');
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(path.join(brokenDir, 'info.json'), '{broken json', 'utf8');

    const games = await discoverRemoteGames({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(games).toHaveLength(1);
    expect(games[0].gameId).toBe('1245620');
    expect(games[0].backups).toHaveLength(1);
    expect(games[0].backups[0].dir).toBe('2026-10-01T10-00-00-000Z');
  });

  it('全部备份均为墓碑的游戏不返回', async () => {
    await writeInfo('1245620', '2026-10-01T10-00-00-000Z', {
      gameId: '1245620', gameName: 'Hades', backupTime: '2026-10-01T10:00:00.000Z', note: '', deleted: true,
    });

    const games = await discoverRemoteGames({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(games).toEqual([]);
  });

  it('远端不存在（rclone 退出码 3）时返回空列表', async () => {
    const games = await discoverRemoteGames({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(games).toEqual([]);
  });

  it('远端读取失败时抛出错误', async () => {
    const failingExec = async () => ({ code: 1, stdout: '', stderr: 'connection refused' });

    await expect(discoverRemoteGames({ exec: failingExec, target, stageDir }))
      .rejects.toThrow('读取远端清单失败');
  });

  it('元数据缺少 gameName 时回退为 gameId', async () => {
    await writeInfo('1245620', '2026-10-01T10-00-00-000Z', {
      gameId: '1245620', backupTime: '2026-10-01T10:00:00.000Z', note: '',
    });

    const games = await discoverRemoteGames({
      exec: makeFakeExec(),
      target,
      stageDir,
    });

    expect(games).toHaveLength(1);
    expect(games[0].gameName).toBe('1245620');
  });

  it('未提供 stageDir 时使用临时目录并清理', async () => {
    await writeInfo('1245620', '2026-10-01T10-00-00-000Z', {
      gameId: '1245620', gameName: 'Hades', backupTime: '2026-10-01T10:00:00.000Z', note: '',
    });

    const games = await discoverRemoteGames({ exec: makeFakeExec(), target });

    expect(games).toHaveLength(1);
  });
});

describe('isRemoteGameAddedLocally', () => {
  it('登记表按 gameId 命中视为已添加', () => {
    const added = isRemoteGameAddedLocally(
      { gameId: '1245620', gameName: 'Hades' },
      { knownGames: { 1245620: { appid: '1245620', name: 'Hades' } }, customSaveDirs: [] },
    );

    expect(added).toBe(true);
  });

  it('自定义存档目录按游戏名大小写不敏感命中', () => {
    const added = isRemoteGameAddedLocally(
      { gameId: 'custom-abc', gameName: '艾尔登法环' },
      { knownGames: {}, customSaveDirs: [{ gameName: '艾尔登法环', dir: 'D:/Saves' }] },
    );

    expect(added).toBe(true);
  });

  it('登记表与自定义目录都未命中时视为未添加', () => {
    const added = isRemoteGameAddedLocally(
      { gameId: '1245620', gameName: 'Hades' },
      {
        knownGames: { 413150: { appid: '413150', name: 'Stardew Valley' } },
        customSaveDirs: [{ gameName: '空洞骑士', dir: 'D:/Saves' }],
      },
    );

    expect(added).toBe(false);
  });
});
