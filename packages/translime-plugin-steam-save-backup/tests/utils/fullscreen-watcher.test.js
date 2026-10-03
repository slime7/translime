import { describe, expect, it } from 'vitest';
import {
  buildProbeScript,
  createFullscreenStateResolver,
} from '../../src/utils/fullscreen-watcher';

describe('createFullscreenStateResolver', () => {
  it('连续达到稳定次数的采样才切换状态（避免 alt-tab 掠过全屏窗口触发抖动）', () => {
    const changes = [];
    const apply = createFullscreenStateResolver({
      stableReadings: 2,
      onChange: (value) => changes.push(value),
    });

    expect(apply('1')).toBe(false);
    expect(changes).toEqual([]);
    expect(apply('1')).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('未达稳定次数的瞬时状态被忽略（单次误采样不影响当前判定）', () => {
    const changes = [];
    const apply = createFullscreenStateResolver({
      stableReadings: 2,
      onChange: (value) => changes.push(value),
    });

    apply('1');
    apply('0');
    apply('0');
    expect(changes).toEqual([]);
    expect(apply('0')).toBe(false);
    expect(changes).toEqual([]);
  });

  it('状态回到当前值后重新计数（间隔出现的偶发采样不会累计）', () => {
    const changes = [];
    const apply = createFullscreenStateResolver({
      stableReadings: 3,
      onChange: (value) => changes.push(value),
    });

    apply('1');
    apply('0');
    apply('1');
    apply('1');
    expect(changes).toEqual([]);
    expect(apply('1')).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('全屏退出同样需要稳定确认后才回调 false', () => {
    const changes = [];
    const apply = createFullscreenStateResolver({
      stableReadings: 2,
      onChange: (value) => changes.push(value),
    });

    apply('1');
    apply('1');
    expect(changes).toEqual([true]);
    apply('0');
    expect(changes).toEqual([true]);
    apply('0');
    expect(changes).toEqual([true, false]);
  });
});

describe('buildProbeScript', () => {
  it('脚本包含宿主进程排除与采样间隔（自身窗口与桌面外壳不触发全屏判定）', () => {
    const script = buildProbeScript({ hostPid: 4321, intervalMs: 1500 });
    expect(script).toContain('$hostPid = 4321');
    expect(script).toContain('Start-Sleep -Milliseconds 1500');
    expect(script).toContain('Progman');
    expect(script).toContain('GetForegroundWindow');
  });
});
