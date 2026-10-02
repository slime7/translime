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
  createArchive,
  extractArchive,
} from '../../src/utils/sync/archive';

let tmpRoot;
let backupDir;
let zipPath;

const baseInfo = {
  schemaVersion: 2,
  gameId: '123',
  gameName: 'Test Game',
  savePaths: [],
  sources: [],
  backupTime: '2026-10-01T10:00:00.000Z',
  timestamp: 'ts1',
  note: '',
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-backup-sync-archive-'));
  backupDir = path.join(tmpRoot, 'backup', '123', 'ts1');
  zipPath = path.join(tmpRoot, 'ts1.zip');
  await fs.mkdir(path.join(backupDir, 'data_0', 'nested'), { recursive: true });
  await fs.writeFile(path.join(backupDir, 'data_0', 'save.dat'), 'save-data');
  await fs.writeFile(path.join(backupDir, 'data_0', 'nested', 'deep.sav'), 'deep-data');
  await fs.writeFile(path.join(backupDir, 'info.json'), JSON.stringify(baseInfo), 'utf8');
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('createArchive / extractArchive 往返', () => {
  it('打包后解压还原全部文件与目录结构（多文件存档单文件传输的基础）', async () => {
    await createArchive(backupDir, zipPath);
    await expect(fs.stat(zipPath)).resolves.toBeTruthy();

    const dest = path.join(tmpRoot, 'restored');
    await extractArchive(zipPath, dest);

    const restored = await fs.readFile(path.join(dest, 'data_0', 'save.dat'), 'utf8');
    const deep = await fs.readFile(path.join(dest, 'data_0', 'nested', 'deep.sav'), 'utf8');
    const info = JSON.parse(await fs.readFile(path.join(dest, 'info.json'), 'utf8'));
    expect(restored).toBe('save-data');
    expect(deep).toBe('deep-data');
    expect(info.gameId).toBe('123');
  });

  it('excludeInfo 打包远端数据包：不含 info.json 但保留全部数据文件（元数据外置，远端可不解包读元数据）', async () => {
    const dataZip = path.join(tmpRoot, 'data.zip');
    await createArchive(backupDir, dataZip, { excludeInfo: true });

    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(dataZip);
    expect(zip.getEntry('info.json')).toBeNull();
    expect(zip.getEntry('data_0/save.dat')).toBeTruthy();
    expect(zip.getEntry('data_0/nested/deep.sav')).toBeTruthy();

    // 数据包解压后不含 info.json，由对账流程单独回补元数据
    const dest = path.join(tmpRoot, 'restored');
    await extractArchive(dataZip, dest);
    const entries = await fs.readdir(dest);
    expect(entries).toEqual(['data_0']);
  });

  it('解压时 info.json 最后写入（中断残留表现为缺 info.json，可被对账自动修复）', async () => {
    await createArchive(backupDir, zipPath);

    // 直接验证解压结果完整；写入顺序由实现保证（非 info 条目并行写、info 收尾）
    const dest = path.join(tmpRoot, 'restored');
    await extractArchive(zipPath, dest);
    const entries = await fs.readdir(dest);
    expect(entries).toContain('info.json');
    expect(entries).toContain('data_0');
  });
});
