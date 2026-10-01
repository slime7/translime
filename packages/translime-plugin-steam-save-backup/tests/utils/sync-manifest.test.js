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
  buildManifest,
  canonicalStringify,
  infoDigest,
  planSync,
} from '../../src/utils/sync/manifest';

let tmpRoot;

const writeBackup = async (root, gameId, timestamp, info) => {
  const dir = path.join(root, gameId, timestamp);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'info.json'), JSON.stringify(info), 'utf8');
  return dir;
};

const baseInfo = (gameId, timestamp, extra = {}) => ({
  schemaVersion: 2,
  gameId,
  gameName: 'Test Game',
  savePaths: [],
  sources: [],
  backupTime: '2026-10-01T10:00:00.000Z',
  timestamp,
  note: '',
  ...extra,
});

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'save-backup-sync-manifest-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('canonicalStringify / infoDigest', () => {
  it('对象键顺序不同摘要一致，避免写入端序列化差异误判为内容差异', () => {
    const a = { b: 2, a: 1, nested: { y: [1, 2], x: 'z' } };
    const b = { nested: { x: 'z', y: [1, 2] }, a: 1, b: 2 };

    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('数组顺序参与摘要，存档文件列表不同视为不同备份', () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
  });

  it('note 是本地元数据：仅备注不同的同名备份不得判为冲突（防止备注编辑触发整目录复制）', () => {
    const withNoteA = baseInfo('123', 'ts1', { note: '打完第一章' });
    const withNoteB = baseInfo('123', 'ts1', { note: '通了二周目' });

    expect(infoDigest(withNoteA)).toBe(infoDigest(withNoteB));
  });

  it('除 note 外任何字段差异都会改变摘要（防止冲突检测漏报导致备份被静默覆盖）', () => {
    expect(infoDigest(baseInfo('123', 'ts1'))).not.toBe(infoDigest(baseInfo('123', 'ts1', {
      savePaths: [{ index: 0, files: ['save.dat'] }],
    })));
    expect(infoDigest(baseInfo('123', 'ts1', { createdBy: 'machine-a' })))
      .not.toBe(infoDigest(baseInfo('123', 'ts1', { createdBy: 'machine-b' })));
  });
});

describe('buildManifest', () => {
  it('只收录含可解析 info.json 的备份目录：缺 info.json（传输中断残留）与损坏文件均跳过', async () => {
    await writeBackup(tmpRoot, '123', 'ts-valid', baseInfo('123', 'ts-valid'));
    const brokenDir = path.join(tmpRoot, '123', 'ts-broken');
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(path.join(brokenDir, 'info.json'), 'not-json{', 'utf8');

    const partialDir = path.join(tmpRoot, '123', 'ts-partial');
    await fs.mkdir(partialDir, { recursive: true });
    await fs.writeFile(path.join(partialDir, 'save.dat'), 'x');

    const manifest = await buildManifest(tmpRoot);

    expect(Object.keys(manifest)).toEqual(['123']);
    expect(Object.keys(manifest['123'])).toEqual(['ts-valid']);
    expect(manifest['123']['ts-valid']).toBe(infoDigest(baseInfo('123', 'ts-valid')));
  });

  it('根目录或游戏目录不存在时返回空清单而不是抛错（首次同步 / 新装机）', async () => {
    await expect(buildManifest(path.join(tmpRoot, 'not-exist'))).resolves.toEqual({});
    await writeBackup(tmpRoot, '123', 'ts', baseInfo('123', 'ts'));
    await expect(buildManifest(path.join(tmpRoot, '999'))).resolves.toEqual({});
  });

  it('非目录项与游戏目录下的散落文件不进入清单', async () => {
    await writeBackup(tmpRoot, '123', 'ts', baseInfo('123', 'ts'));
    await fs.writeFile(path.join(tmpRoot, '123', 'loose-file.txt'), 'x');

    const manifest = await buildManifest(tmpRoot);

    expect(Object.keys(manifest['123'])).toEqual(['ts']);
  });
});

describe('planSync', () => {
  it('本地独有的备份进入上传集，远端独有的进入下载集（集合对账收敛两端）', () => {
    const local = { g1: { ts1: 'd1', ts2: 'd2' } };
    const remote = { g1: { ts2: 'd2', ts3: 'd3' } };

    const plan = planSync(local, remote, 'machine-a');

    expect(plan.uploads).toEqual([{ gameId: 'g1', ts: 'ts1' }]);
    expect(plan.downloads).toEqual([{ gameId: 'g1', ts: 'ts3' }]);
    expect(plan.renames).toEqual([]);
  });

  it('两端一致的目录不产生任何动作（幂等：重复同步为空操作）', () => {
    const manifest = { g1: { ts1: 'd1', ts2: 'd2' } };

    const plan = planSync(manifest, manifest, 'machine-a');

    expect(plan).toEqual({ uploads: [], downloads: [], renames: [] });
  });

  it('同名目录摘要不一致时：本地改名保留、改名副本上传、远端原件下载（两份备份都不丢失）', () => {
    const local = { g1: { ts1: 'local-digest' } };
    const remote = { g1: { ts1: 'remote-digest' } };

    // machineId 取前 8 位作为改名后缀
    const plan = planSync(local, remote, 'machine1-rest-of-uuid');

    expect(plan.renames).toEqual([{ gameId: 'g1', from: 'ts1', to: 'ts1-machine1' }]);
    expect(plan.uploads).toEqual([{ gameId: 'g1', ts: 'ts1-machine1' }]);
    expect(plan.downloads).toEqual([{ gameId: 'g1', ts: 'ts1' }]);
  });

  it('改名目标名已被占用时追加序号，避免覆盖既有备份目录', () => {
    const local = {
      g1: {
        ts1: 'local-digest',
        'ts1-machine1': 'other',
      },
    };
    const remote = { g1: { ts1: 'remote-digest' } };

    const plan = planSync(local, remote, 'machine1-more');

    expect(plan.renames).toEqual([{ gameId: 'g1', from: 'ts1', to: 'ts1-machine1-2' }]);
  });

  it('多游戏互不影响，仅备注差异的同名目录不视为冲突', () => {
    const info = baseInfo('g1', 'ts1', { note: 'a' });
    const local = {
      g1: { ts1: infoDigest(info) },
      g2: { tsX: 'only-local' },
    };
    const remote = {
      g1: { ts1: infoDigest({ ...info, note: 'b' }) },
      g3: { tsY: 'only-remote' },
    };

    const plan = planSync(local, remote, 'machine-a');

    expect(plan.renames).toEqual([]);
    expect(plan.uploads).toEqual([{ gameId: 'g2', ts: 'tsX' }]);
    expect(plan.downloads).toEqual([{ gameId: 'g3', ts: 'tsY' }]);
  });

  it('machineId 为空时使用 local 后缀，冲突处理不因缺省标识而崩溃', () => {
    const local = { g1: { ts1: 'local-digest' } };
    const remote = { g1: { ts1: 'remote-digest' } };

    const plan = planSync(local, remote, '');

    expect(plan.renames).toEqual([{ gameId: 'g1', from: 'ts1', to: 'ts1-local' }]);
  });
});
