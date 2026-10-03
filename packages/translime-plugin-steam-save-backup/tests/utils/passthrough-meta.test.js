import { describe, expect, it } from 'vitest';
import {
  buildEntryId,
  createMeta,
  joinRemoteEntry,
  joinRemoteMeta,
  joinRemotePassthroughRoot,
  markMetaDeleted,
  parseMeta,
} from '../../src/utils/passthrough/meta';

describe('passthrough meta', () => {
  it('条目 ID 由存档名生成且跨设备一致（本地路径各机不同，不能作键）', () => {
    expect(buildEntryId('Hollow Knight')).toBe(buildEntryId(' hollow knight '));
    expect(buildEntryId('A')).not.toBe(buildEntryId('B'));
    expect(buildEntryId('A')).toMatch(/^custom-/);
  });

  it('远端路径统一挂在 passthrough 子树下，meta 位于 .translime 目录（与备份数据隔离）', () => {
    expect(joinRemotePassthroughRoot('GDrive:saves/')).toBe('GDrive:saves/passthrough');
    expect(joinRemoteEntry('GDrive:saves', 'custom-abc')).toBe('GDrive:saves/passthrough/custom-abc');
    expect(joinRemoteMeta('GDrive:saves', 'custom-abc')).toBe(
      'GDrive:saves/passthrough/custom-abc/.translime/meta.json',
    );
  });

  it('createMeta 带非删除标记与机器标识；markMetaDeleted 追加删除字段且不改原对象', () => {
    const meta = createMeta({
      entryId: 'custom-abc', name: 'Test', machineId: 'machine-1', at: '2026-10-01T10:00:00.000Z',
    });
    expect(meta).toEqual({
      schemaVersion: 1,
      entryId: 'custom-abc',
      name: 'Test',
      updatedAt: '2026-10-01T10:00:00.000Z',
      updatedBy: 'machine-1',
      deleted: false,
    });

    const tomb = markMetaDeleted(meta, {
      machineId: 'machine-1', at: '2026-10-02T10:00:00.000Z',
    });
    expect(tomb.deleted).toBe(true);
    expect(tomb.deletedAt).toBe('2026-10-02T10:00:00.000Z');
    expect(tomb.deletedBy).toBe('machine-1');
    expect(meta.deleted).toBe(false);
  });

  it('parseMeta 往返解析；结构不合法或缺 entryId 时返回 null（视为远端尚无此条目）', () => {
    const meta = markMetaDeleted(createMeta({
      entryId: 'custom-abc', name: 'Test', machineId: 'm1', at: '2026-10-01T10:00:00.000Z',
    }), { machineId: 'm1', at: '2026-10-02T10:00:00.000Z' });

    expect(parseMeta(JSON.parse(JSON.stringify(meta)))).toEqual(meta);
    expect(parseMeta(null)).toBe(null);
    expect(parseMeta('x')).toBe(null);
    expect(parseMeta({ name: 'no entryId' })).toBe(null);
    expect(parseMeta({ entryId: 'custom-abc' })).toEqual({
      schemaVersion: 1,
      entryId: 'custom-abc',
      name: '',
      updatedAt: null,
      updatedBy: null,
      deleted: false,
      deletedAt: null,
      deletedBy: null,
    });
  });
});
