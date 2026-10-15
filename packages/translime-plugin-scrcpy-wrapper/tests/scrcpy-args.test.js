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

  it('镜像模式带包名时输出 start-app，投屏前把应用拉到前台', () => {
    expect(buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: 'com.foo',
      title: 'translime-scrcpy-3',
    })).toEqual([
      '--serial=ABC123',
      '--window-title=translime-scrcpy-3',
      '--video-codec=h265',
      '--start-app=com.foo',
    ]);
  });

  it('虚拟屏模式默认仅输出 new-display，并关闭系统装饰保证应用全屏沉浸', () => {
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
      '--no-vd-system-decorations',
      '--start-app=com.foo',
    ]);
  });

  it('虚拟屏模式给定分辨率时输出显式 new-display 并开启 flex-display', () => {
    expect(buildScrcpyArgs({
      mode: 'virtual',
      serial: 'ABC123',
      pkg: 'com.foo',
      title: 'translime-scrcpy-2',
      virtualDisplaySize: { width: 871, height: 1184 },
    })).toEqual([
      '--serial=ABC123',
      '--window-title=translime-scrcpy-2',
      '--video-codec=h265',
      '--new-display=871x1184',
      '-x',
      '--no-vd-system-decorations',
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
