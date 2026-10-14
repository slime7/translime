let titleSeq = 0;

/**
 * 生成全局唯一的 scrcpy 窗口标题，供 FindWindowW 精确定位
 */
export const nextWindowTitle = () => {
  titleSeq += 1;
  return `translime-scrcpy-${titleSeq}`;
};

/**
 * 构建 scrcpy 启动参数：
 * 默认 h265 编码 + 声音开启；virtual 模式使用虚拟屏幕并可选直接拉起应用。
 * virtualDisplaySize 给定时以显式分辨率创建虚拟屏，并开启 flex-display
 * 让虚拟屏连续跟随窗口尺寸（内容随拉伸重排，不出现黑边）
 */
export const buildScrcpyArgs = ({
  mode,
  serial,
  pkg,
  title,
  virtualDisplaySize = null,
}) => {
  const args = [
    `--serial=${serial}`,
    `--window-title=${title}`,
    '--video-codec=h265',
  ];
  if (mode === 'virtual') {
    if (virtualDisplaySize) {
      args.push(`--new-display=${virtualDisplaySize.width}x${virtualDisplaySize.height}`, '-x');
    } else {
      args.push('--new-display');
    }
    if (pkg) {
      args.push(`--start-app=${pkg}`);
    }
  }
  return args;
};
