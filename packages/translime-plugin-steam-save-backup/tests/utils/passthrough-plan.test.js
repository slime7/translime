import { describe, expect, it } from 'vitest';
import planPassthroughEntry from '../../src/utils/passthrough/plan';

describe('planPassthroughEntry', () => {
  it('两端都在且远端未删除 → 双向增量同步（直通模式的常规路径）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false },
      localExists: true,
      localNewestMtime: 1000,
    });
    expect(plan.action).toBe('sync');
  });

  it('远端尚无条目且本地存在 → 同步（新条目首次上传）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: null,
      localExists: true,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('sync');
  });

  it('远端已删除且本地无更新 → 跟随删除本地（删除传播的核心语义）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: '2026-10-01T10:00:00.000Z' },
      localExists: true,
      localNewestMtime: Date.parse('2026-10-01T09:00:00.000Z'),
    });
    expect(plan.action).toBe('apply-deletion');
  });

  it('本地在远端删除之后仍有更新 → 转冲突待确认（防止误删这台机器上又玩过的存档）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: '2026-10-01T10:00:00.000Z' },
      localExists: true,
      localNewestMtime: Date.parse('2026-10-01T11:00:00.000Z'),
    });
    expect(plan.action).toBe('deletion-conflict');
  });

  it('删除时间不可解析 → 保守转冲突（不凭空删用户存档）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: 'not-a-date' },
      localExists: true,
      localNewestMtime: 1000,
    });
    expect(plan.action).toBe('deletion-conflict');
  });

  it('本地目录为空且删除时间有效 → 直接跟随删除（空目录无数据可丢）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: '2026-10-01T10:00:00.000Z' },
      localExists: true,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('apply-deletion');
  });

  it('远端已删除且本地也没有 → 无动作（远端墓碑保留，防止其他端复活）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: true, deletedAt: '2026-10-01T10:00:00.000Z' },
      localExists: false,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('noop');
  });

  it('本地目录缺失且远端未删除 → 不自动回补（避免与用户删除动作对抗，交给用户选择）', () => {
    const plan = planPassthroughEntry({
      remoteMeta: { deleted: false },
      localExists: false,
      localNewestMtime: null,
    });
    expect(plan.action).toBe('local-missing');
  });
});
