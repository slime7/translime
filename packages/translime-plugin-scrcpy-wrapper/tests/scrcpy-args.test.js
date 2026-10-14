import { describe, expect, it } from 'vitest';
import { buildScrcpyArgs, nextWindowTitle } from '../src/scrcpy-args';

describe('buildScrcpyArgs', () => {
  it('镜像模式包含 serial、窗口标题与 h265 编码', () => {
    expect(buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 'translime-scrcpy-1',
    })).toEqual([
      '--serial=ABC123',
      '--window-title=translime-scrcpy-1',
      '--video-codec=h265',
    ]);
  });

  it('虚拟屏模式附带 new-display 与 start-app', () => {
    expect(buildScrcpyArgs({
      mode: 'virtual',
      serial: 'ABC123',
      pkg: 'com.foo',
      title: 'translime-scrcpy-2',
    })).toEqual([
      '--serial=ABC123',
      '--window-title=translime-scrcpy-2',
      '--video-codec=h265',
      '--new-display',
      '--start-app=com.foo',
    ]);
  });

  it('虚拟屏模式未指定应用时不输出 start-app', () => {
    const args = buildScrcpyArgs({
      mode: 'virtual',
      serial: 'ABC123',
      pkg: null,
      title: 't',
    });
    expect(args).toContain('--new-display');
    expect(args.some((arg) => arg.startsWith('--start-app='))).toBe(false);
  });
});

describe('nextWindowTitle', () => {
  it('连续调用生成互不相同的标题且带统一前缀', () => {
    const titles = [nextWindowTitle(), nextWindowTitle(), nextWindowTitle()];
    expect(new Set(titles).size).toBe(3);
    titles.forEach((title) => {
      expect(title).toMatch(/^translime-scrcpy-\d+$/);
    });
  });
});
