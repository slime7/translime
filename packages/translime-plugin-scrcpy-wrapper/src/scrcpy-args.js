let titleSeq = 0;

/**
 * 生成全局唯一的 scrcpy 窗口标题，供 FindWindowW 精确定位
 */
export const nextWindowTitle = () => {
  titleSeq += 1;
  return `translime-scrcpy-${titleSeq}`;
};

// scrcpy 客户端输出的真实视频纹理尺寸行。
// v3.x（display.c）与 v4.x 软件互通层在 INFO 级输出 `Texture: WxH`，
// v4.x 硬解路径不打印纹理尺寸，仅在帧尺寸与协商值不一致时输出
// WARN `Unexpected video size: WxH (expected WxH)`。编码器对齐等原因
// 会让实际帧尺寸偏离 adb 上报的屏幕分辨率，SDL 内部会按真实帧比例
// letterbox，必须以这里的尺寸作为窗口比例源。
const TEXTURE_SIZE_RE = /Texture\s*(?:\([^)]*\))?\s*:\s*(\d+)\s*x\s*(\d+)/i;
const UNEXPECTED_SIZE_RE = /Unexpected video size:\s*(\d+)\s*x\s*(\d+)/i;

/**
 * 从 scrcpy 输出行解析真实视频尺寸，无法解析或数值非法时返回 null。
 *
 * @param {string} line - scrcpy stdout/stderr 的单行输出。
 * @returns {{ width: number, height: number } | null}
 */
export const parseVideoSize = (line) => {
  const text = String(line ?? '');
  const match = text.match(TEXTURE_SIZE_RE) || text.match(UNEXPECTED_SIZE_RE);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  return { width, height };
};

/**
 * 规范化十六进制颜色为 scrcpy `--background-color` 接受的 RRGGBB 形式，
 * 非法输入返回 null
 *
 * @param {string} value - 形如 `#79747E` / `79747E` 的颜色值。
 * @returns {string | null}
 */
export const normalizeHexColor = (value) => {
  const text = String(value ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(text)) {
    return null;
  }
  return text.toLowerCase();
};

/**
 * 构建 scrcpy 启动参数：
 * 默认 h265 编码 + 声音开启；virtual 模式使用虚拟屏幕。
 * 指定 pkg 时通过 --start-app 拉起应用（scrcpy 以 LAUNCHER intent 启动，
 * 已在后台运行的任务会被带到前台）：mirror 模式在默认屏拉起后镜像，
 * virtual 模式在虚拟屏内启动。
 * mirror 模式不设置 flex 与分辨率，由 scrcpy 自动处理缩放；
 * 渲染用 stretched 铺满窗口（窗口比例由 wrapper 锁定，避免 letterbox
 * 在高 DPI 下因点/像素取整残留缝隙），并关闭其窗口比例锁避免与外部
 * SetWindowPos 定尺寸互相干预；backgroundColor（RRGGBB）用作
 * letterbox 底色，与外框 outline 同色以贴合圆角。需 scrcpy >= 5.0。
 * virtualDisplaySize 给定时以显式分辨率创建虚拟屏，虚拟屏始终开启
 * flex-display 连续跟随窗口尺寸（内容随拉伸重排，不出现黑边）。
 * 虚拟屏关闭系统装饰，应用全屏铺满画面区，不显示状态栏、手势栏与标题装饰栏；
 * 输入法策略设为 local，软键盘弹出在虚拟屏内而不是实体屏（默认 fallback
 * 弹在默认屏，虚拟窗口内看不到输入法）；关闭虚拟屏时应用转回实体屏而不是
 * 销毁（--no-vd-destroy-content）；音频源设为 playback 独立采集：
 * output（REMOTE_SUBMIX）会禁用设备端播放，且与整屏镜像会话的 output
 * 采集互斥；playback 只复制播放流，要求 Android 13+，采集失败时 scrcpy
 * 默认自动降级为无声继续；keep-active 在会话期间保持设备不息屏；
 * SDL 窗口无边框避免挂载前闪现原生标题栏。bitRate 与 maxFps 可选，
 * 由设备专属设置传入，有值时在镜像和虚拟屏中同时生效。需 scrcpy >= 5.0。
 */
export const buildScrcpyArgs = ({
  mode,
  serial,
  pkg,
  title,
  virtualDisplaySize = null,
  backgroundColor = null,
  bitRate = null,
  maxFps = null,
}) => {
  const args = [
    `--serial=${serial}`,
    `--window-title=${title}`,
    '--video-codec=h265',
  ];
  if (bitRate) {
    args.push(`--video-bit-rate=${bitRate}`);
  }
  if (maxFps) {
    args.push(`--max-fps=${maxFps}`);
  }
  if (mode === 'mirror') {
    args.push('--render-fit=stretched', '--no-window-aspect-ratio-lock');
    if (backgroundColor) {
      args.push(`--background-color=${backgroundColor}`);
    }
  }
  if (mode === 'virtual') {
    if (virtualDisplaySize) {
      args.push(`--new-display=${virtualDisplaySize.width}x${virtualDisplaySize.height}`);
    } else {
      args.push('--new-display');
    }
    args.push(
      '--flex-display',
      '--no-vd-system-decorations',
      '--display-ime-policy=local',
      '--no-vd-destroy-content',
      '--audio-source=playback',
      '--keep-active',
      '--window-borderless',
    );
  }
  if (pkg) {
    args.push(`--start-app=${pkg}`);
  }
  return args;
};
