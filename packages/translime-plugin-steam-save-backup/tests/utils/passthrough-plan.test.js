import { describe, expect, it } from 'vitest';
import planPassthroughEntry from '../../src/utils/passthrough/plan';

const T0 = '2026-10-01T10:00:00.000Z';
const T0_MS = Date.parse(T0);
const T1 = '2026-10-02T10:00:00.000Z';
const T1_MS = Date.parse(T1);

describe('planPassthroughEntry 删除语义（不受打包化影响）', () => {
  it('远端已删除且本地无更新 → 跟随删除本地（删除传播的核心语义）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: T0 },
      localExists: true,
      localChanged: false,
      localNewestMtime: Date.parse('2026-10-01T09:00:00.000Z'),
    });
    expect(plan.action).toBe('apply-deletion');
  });

  it('本地在远端删除之后仍有更新 → 转冲突待确认（防止误删这台机器上又玩过的存档）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: T0 },
      localExists: true,
      localChanged: false,
      localNewestMtime: Date.parse('2026-10-01T11:00:00.000Z'),
    });
    expect(plan.action).toBe('deletion-conflict');
  });

  it('删除时间不可解析 → 保守转冲突（不凭空删用户存档）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: 'not-a-date' },
      localExists: true,
      localChanged: false,
      localNewestMtime: 1000,
    });
    expect(plan.action).toBe('deletion-conflict');
  });

  it('本地目录为空且删除时间有效 → 直接跟随删除（空目录无数据可丢）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: T0 },
      localExists: true,
      localChanged: false,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('apply-deletion');
  });

  it('远端已删除且本地也没有 → 无动作（远端墓碑保留，防止其他端复活）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: T0 },
      localExists: false,
      localChanged: false,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('noop');
  });

  it('本地目录缺失且远端未删除 → 不自动回补（避免与用户删除动作对抗，交给用户选择）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false },
      localExists: false,
      localChanged: false,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('local-missing');
  });
});

describe('planPassthroughEntry 快照同步方向（数据包 + 水位/清单基线）', () => {
  it('远端尚无条目 → 上传建立条目（首次直通）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: null,
      localExists: true,
      localChanged: true,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('sync-upload');
  });

  it('基线未知且本地较新 → 上传', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T0 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T1_MS,
    });
    expect(plan.action).toBe('sync-upload');
  });

  it('基线未知且远端不旧于本地 → 下载（新设备首次对账拉取远端快照）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T0_MS,
      remoteHasData: true,
    });
    expect(plan.action).toBe('sync-download');
  });

  it('两端时间相同 → 以远端为准下载（远端是单一可靠源）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T0 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T0_MS,
      remoteHasData: true,
    });
    expect(plan.action).toBe('sync-download');
  });

  it('两端自基线后均无变化 → noop（稳态零传输，防止反复重传数据包）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: false,
      localNewestMtime: T0_MS,
      watermark: T1,
      remoteHasData: true,
    });
    expect(plan.action).toBe('noop');
  });

  it('本地目录为空且两端无变化 → noop（空目录的稳态）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: false,
      localNewestMtime: null,
      watermark: T1,
      remoteHasData: true,
    });
    expect(plan.action).toBe('noop');
  });

  it('仅本地有变化 → 上传（清单比对发现新增/修改，文件监控触发的常规上传路径）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T0 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T1_MS,
      watermark: T0,
      remoteHasData: true,
    });
    expect(plan.action).toBe('sync-upload');
  });

  it('仅远端有更新 → 下载（其他设备上传后的拉取路径）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: false,
      localNewestMtime: T0_MS,
      watermark: T0,
      remoteHasData: true,
    });
    expect(plan.action).toBe('sync-download');
  });

  it('两端都有变化（有共同基线）→ 内容冲突待用户选择', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T0 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T1_MS,
      watermark: '2026-09-30T10:00:00.000Z',
      remoteHasData: true,
    });
    expect(plan.action).toBe('content-conflict');
  });

  it('两端都有变化且远端较新 → 同样转内容冲突', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T0_MS,
      watermark: '2026-09-30T10:00:00.000Z',
      remoteHasData: true,
    });
    expect(plan.action).toBe('content-conflict');
  });

  it('两端都有变化且本地 mtime 不可知 → 仍转内容冲突', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: true,
      localNewestMtime: null,
      watermark: '2026-09-30T10:00:00.000Z',
      remoteHasData: true,
    });
    expect(plan.action).toBe('content-conflict');
  });

  it('双端都有变化但远端没有数据包 → 上传重建', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T0_MS,
      watermark: '2026-09-30T10:00:00.000Z',
      remoteHasData: false,
    });
    expect(plan.action).toBe('sync-upload');
  });

  it('基线未知且本地较新 → 上传', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T0 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T1_MS,
    });
    expect(plan.action).toBe('sync-upload');
  });

  it('基线未知且远端不旧于本地 → 下载', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T0_MS,
      remoteHasData: true,
    });
    expect(plan.action).toBe('sync-download');
  });

  it('远端 updatedAt 不可解析 → 保守视为远端有变化走下载', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: 'broken' },
      localExists: true,
      localChanged: false,
      localNewestMtime: T0_MS,
      watermark: T0,
      remoteHasData: true,
    });
    expect(plan.action).toBe('sync-download');
  });

  it('下载方向兜底：远端没有数据包（旧布局或仅剩 meta 空壳）→ 改判上传，以本地重建远端', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T1 },
      localExists: true,
      localChanged: false,
      localNewestMtime: T0_MS,
      watermark: T0,
      remoteHasData: false,
    });
    expect(plan.action).toBe('sync-upload');
  });

  it('基线未知且远端没有数据包 → 上传自愈', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false, updatedAt: T0 },
      localExists: true,
      localChanged: true,
      localNewestMtime: T0_MS,
      remoteHasData: false,
    });
    expect(plan.action).toBe('sync-upload');
  });
});
