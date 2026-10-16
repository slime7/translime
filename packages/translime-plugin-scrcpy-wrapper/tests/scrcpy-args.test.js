import { describe, expect, it } from 'vitest';
import { buildScrcpyArgs, nextWindowTitle, parseVideoSize } from '../src/scrcpy-args';

describe('buildScrcpyArgs', () => {
  it('镜像模式包含 serial、窗口标题与 h265 编码', () => {
    const args = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 'translime-scrcpy-1',
    });
    expect(args.slice(0, 3)).toEqual([
      '--serial=ABC123',
      '--window-title=translime-scrcpy-1',
      '--video-codec=h265',
    ]);
  });

  it('镜像模式默认不设置 flex 与分辨率（防止镜像窗口被 scrcpy 侧虚拟屏逻辑接管）', () => {
    const args = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 'translime-scrcpy-1',
    });
    expect(args.some((arg) => arg.startsWith('--new-display'))).toBe(false);
    expect(args).not.toContain('-x');
  });

  it('镜像模式用 stretched 渲染并关闭窗口比例锁（防止 scrcpy letterbox 在高 DPI 取整下残留缝隙）', () => {
    const args = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 'translime-scrcpy-1',
    });
    expect(args).toContain('--render-fit=stretched');
    expect(args).toContain('--no-window-aspect-ratio-lock');
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
      '--render-fit=stretched',
      '--no-window-aspect-ratio-lock',
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

describe('parseVideoSize', () => {
  it('解析 v3.x/v4.x 软件互通层输出的纹理尺寸行（防止比例源失效导致 SDL 内 letterbox 留缝）', () => {
    expect(parseVideoSize('INFO: Texture: 1080x2340')).toEqual({ width: 1080, height: 2340 });
    expect(parseVideoSize('INFO: Texture: 864x1920')).toEqual({ width: 864, height: 1920 });
  });

  it('兼容带指针括号与大小写变体（防止日志前缀差异导致漏解析）', () => {
    expect(parseVideoSize('INFO: Texture (0x7f8a1c00): 1088x2400')).toEqual({ width: 1088, height: 2400 });
    expect(parseVideoSize('INFO: texture : 224x496')).toEqual({ width: 224, height: 496 });
  });

  it('解析 v4.x 硬解路径的尺寸不一致警告作为兜底数据源', () => {
    expect(parseVideoSize('WARN: Unexpected video size: 1050x2160 (expected 1080x2160)'))
      .toEqual({ width: 1050, height: 2160 });
  });

  it('纹理创建/失败等其他日志行不误匹配（防止错误比例源反复改写窗口比例）', () => {
    expect(parseVideoSize('DEBUG: Creating new D3D11VA texture: size=1920x1080')).toBeNull();
    expect(parseVideoSize('ERROR: Could not create texture: 2 errors')).toBeNull();
    expect(parseVideoSize('[server] INFO: Screen: 1080x2400')).toBeNull();
    expect(parseVideoSize('INFO: Renderer: direct3d11')).toBeNull();
    expect(parseVideoSize('')).toBeNull();
    expect(parseVideoSize(null)).toBeNull();
  });
});
