import { describe, expect, it } from 'vitest';
import {
  buildScrcpyArgs, nextWindowTitle, normalizeHexColor, parseVideoSize,
} from '../src/scrcpy-args';

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

  it('镜像模式带背景色时输出 background-color（letterbox 底色与外框 outline 同色贴合圆角）', () => {
    const args = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 'translime-scrcpy-1',
      backgroundColor: '79747e',
    });
    expect(args).toContain('--background-color=79747e');
  });

  it('未提供背景色时不输出 background-color（保留 scrcpy 默认行为）', () => {
    const args = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 'translime-scrcpy-1',
    });
    expect(args.some((arg) => arg.startsWith('--background-color'))).toBe(false);
  });

  it('虚拟屏模式忽略背景色（无外框与 letterbox，避免误改虚拟屏底色）', () => {
    const args = buildScrcpyArgs({
      mode: 'virtual',
      serial: 'ABC123',
      pkg: null,
      title: 't',
      backgroundColor: '79747e',
    });
    expect(args.some((arg) => arg.startsWith('--background-color'))).toBe(false);
  });

  it('虚拟屏模式默认输出 new-display 与完整沉浸参数（输入法内嵌、应用回退、独立音频与唤醒）', () => {
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
      '--flex-display',
      '--no-vd-system-decorations',
      '--display-ime-policy=local',
      '--no-vd-destroy-content',
      '--audio-source=playback',
      '--keep-active',
      '--window-borderless',
      '--start-app=com.foo',
    ]);
  });

  it('镜像与虚拟屏模式均支持动态码率与最高帧率配置', () => {
    const mirrorArgs = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 't',
      bitRate: '16M',
      maxFps: 60,
    });
    expect(mirrorArgs).toContain('--video-bit-rate=16M');
    expect(mirrorArgs).toContain('--max-fps=60');

    const virtualArgs = buildScrcpyArgs({
      mode: 'virtual',
      serial: 'ABC123',
      pkg: null,
      title: 't',
      bitRate: '24M',
      maxFps: 90,
    });
    expect(virtualArgs).toContain('--video-bit-rate=24M');
    expect(virtualArgs).toContain('--max-fps=90');
  });

  it('未指定码率或最高帧率时不输出对应 flag', () => {
    const args = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 't',
    });
    expect(args.some((a) => a.startsWith('--video-bit-rate='))).toBe(false);
    expect(args.some((a) => a.startsWith('--max-fps='))).toBe(false);
  });

  it('虚拟屏模式开启 display-ime-policy=local，输入法弹出在虚拟屏窗口内而非实体屏（默认 fallback 时窗口内看不到输入法）', () => {
    const args = buildScrcpyArgs({
      mode: 'virtual',
      serial: 'ABC123',
      pkg: null,
      title: 't',
    });
    expect(args).toContain('--display-ime-policy=local');
  });

  it('虚拟屏模式音频用 playback 音源独立采集（output 会禁用设备端播放，且与镜像会话的 output 采集互斥）', () => {
    const args = buildScrcpyArgs({
      mode: 'virtual',
      serial: 'ABC123',
      pkg: null,
      title: 't',
    });
    expect(args).toContain('--audio-source=playback');
  });

  it('镜像模式不改音频源与输入法策略（保持 scrcpy 默认行为，镜像静音设备属预期）', () => {
    const args = buildScrcpyArgs({
      mode: 'mirror',
      serial: 'ABC123',
      pkg: null,
      title: 't',
    });
    expect(args.some((arg) => arg.startsWith('--audio-source='))).toBe(false);
    expect(args.some((arg) => arg.startsWith('--display-ime-policy='))).toBe(false);
  });

  it('虚拟屏模式给定分辨率时输出显式 new-display 分辨率', () => {
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
      '--flex-display',
      '--no-vd-system-decorations',
      '--display-ime-policy=local',
      '--no-vd-destroy-content',
      '--audio-source=playback',
      '--keep-active',
      '--window-borderless',
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

describe('normalizeHexColor', () => {
  it('接受 # 前缀并输出小写 RRGGBB（宿主主题令牌可直接使用）', () => {
    expect(normalizeHexColor('#79747E')).toBe('79747e');
    expect(normalizeHexColor('938F99')).toBe('938f99');
  });

  it('非法颜色返回 null（防止把错误值传给 scrcpy 导致启动失败）', () => {
    expect(normalizeHexColor('rgb(121, 116, 126)')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor('#1234567')).toBeNull();
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
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
