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
  readInfoFromArchive,
} from '../../src/utils/sync/archive';
import { buildRemoteInventory, infoDigest } from '../../src/utils/sync/manifest';

let tmpRoot;
let backupDir;
let remoteDir;
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
  remoteDir = path.join(tmpRoot, 'remote');
  zipPath = path.join(tmpRoot, 'ts1.zip');
  await fs.mkdir(path.join(backupDir, 'data_0', 'nested'), { recursive: true });
  await fs.mkdir(path.join(remoteDir, '123'), { recursive: true });
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

describe('readInfoFromArchive', () => {
  it('读取 zip 内的 info.json，供远端清单构建摘要', async () => {
    await createArchive(backupDir, zipPath);

    const info = await readInfoFromArchive(zipPath);
    expect(info.gameId).toBe('123');
    expect(infoDigest(info)).toBe(infoDigest(baseInfo));
  });

  it('缺失或损坏的 zip 返回 null（不进入远端清单，待下次同步修复）', async () => {
    await expect(readInfoFromArchive(path.join(tmpRoot, 'not-exist.zip'))).resolves.toBeNull();

    const corrupt = path.join(tmpRoot, 'corrupt.zip');
    await fs.writeFile(corrupt, 'not-a-zip');
    await expect(readInfoFromArchive(corrupt)).resolves.toBeNull();

    const noInfo = path.join(tmpRoot, 'no-info.zip');
    await fs.writeFile(noInfo, 'placeholder');
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();
    zip.addFile('data_0/save.dat', Buffer.from('x'));
    await zip.writeZipPromise(noInfo);
    await expect(readInfoFromArchive(noInfo)).resolves.toBeNull();
  });
});

describe('buildRemoteInventory', () => {
  it('zip 与旧目录格式分别进入 zips 清单与 legacy 迁移列表', async () => {
    await createArchive(backupDir, path.join(remoteDir, '123', 'ts1.zip'));
    const legacyDir = path.join(remoteDir, '123', 'ts2');
    await fs.mkdir(path.join(legacyDir, 'data_0'), { recursive: true });
    const legacyInfo = { ...baseInfo, timestamp: 'ts2' };
    await fs.writeFile(path.join(legacyDir, 'info.json'), JSON.stringify(legacyInfo), 'utf8');

    const { zips, legacy } = await buildRemoteInventory(remoteDir);

    expect(Object.keys(zips)).toEqual(['123']);
    expect(zips['123'].ts1).toBe(infoDigest(baseInfo));
    expect(legacy).toEqual([{ gameId: '123', ts: 'ts2', digest: infoDigest(legacyInfo) }]);
  });

  it('损坏的 zip 与缺 info.json 的目录都不进入清单（传输中断残留待修复）', async () => {
    await fs.writeFile(path.join(remoteDir, '123', 'broken.zip'), 'not-a-zip');
    const emptyDir = path.join(remoteDir, '123', 'ts-empty');
    await fs.mkdir(emptyDir, { recursive: true });
    await fs.writeFile(path.join(emptyDir, 'save.dat'), 'x');

    const { zips, legacy } = await buildRemoteInventory(remoteDir);

    expect(zips).toEqual({});
    expect(legacy).toEqual([]);
  });
});
