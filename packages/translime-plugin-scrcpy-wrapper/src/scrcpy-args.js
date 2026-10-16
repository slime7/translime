let titleSeq = 0;

/**
 * 生成全局唯一的 scrcpy 窗口标题，供 FindWindowW 精确定位
 */
export const nextWindowTitle = () => {
  titleSeq += 1;
  return `translime-scrcpy-${titleSeq}`;
};

// scrcpy 视频尺寸匹配表达式
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
 * 构建 scrcpy 启动参数
 *
 * @param {object} options
 * @param {'mirror' | 'virtual'} options.mode - 会话模式：mirror（整屏镜像）或 virtual（虚拟屏）。
 * @param {string} options.serial - 目标设备序列号。
 * @param {string} [options.pkg] - 启动的应用包名。
 * @param {string} options.title - 窗口标题。
 * @param {{ width: number, height: number }} [options.virtualDisplaySize] - 虚拟屏初始分辨率。
 * @param {string} [options.backgroundColor] - 镜像画面底色（RRGGBB 格式）。
 * @param {string} [options.bitRate] - 视频码率，如 '16M'。
 * @param {number} [options.maxFps] - 最高帧率。
 * @returns {string[]} scrcpy 命令行参数列表。
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
