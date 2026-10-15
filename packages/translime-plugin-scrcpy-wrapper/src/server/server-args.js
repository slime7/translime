/**
 * scrcpy-server v5.0.1 启动命令构建。
 *
 * 设备端启动方式（对照 scrcpy v5.0.1 源码 app/src/server.c）：
 *   adb -s <serial> shell CLASSPATH=<设备路径> app_process / com.genymobile.scrcpy.Server <版本> <key=value...>
 * - args[0] 必须与 server 内置版本号严格一致，否则 server 立即抛异常退出
 * - scid 为 31 位非负整数，按十六进制传参，localabstract socket 名为 `scrcpy_%08x`
 * - 参数值不得包含 shell 特殊字符（经 adb shell 传递无转义）
 */

export const SERVER_VERSION = '5.0.1';
export const SERVER_DEVICE_PATH = '/data/local/tmp/translime_scrcpy_server.jar';
export const SERVER_ENTRY_CLASS = 'com.genymobile.scrcpy.Server';

/**
 * scid 格式化为 8 位小写十六进制（与 socket 命名一致）
 *
 * @param {number} scid - 31 位非负整数会话 id。
 * @returns {string}
 */
export const formatScid = (scid) => scid.toString(16).padStart(8, '0');

/**
 * scid 对应的 localabstract socket 名（server 端 DesktopConnection 同规则）
 *
 * @param {number} scid
 * @returns {string}
 */
export const socketNameForScid = (scid) => `scrcpy_${formatScid(scid)}`;

/**
 * 构建 server 端 key=value 参数表
 *
 * @param {object} options
 * @param {number} options.scid - 31 位非负整数会话 id。
 * @param {'h264'|'h265'} [options.videoCodec='h264'] - 视频编码。
 * @param {boolean} [options.audio=true] - 是否转发音频。
 * @param {number} [options.maxSize=0] - 视频短边上限，0 表示不限制。
 * @param {number} [options.maxFps=0] - 帧率上限，0 表示不限制。
 * @param {string|null} [options.newDisplay=null] - 虚拟屏初始分辨率 `WxH`，null 表示镜像物理屏。
 * @param {boolean} [options.flexDisplay=false] - 虚拟屏分辨率是否连续跟随窗口（配合 RESIZE_DISPLAY）。
 * @returns {string[]}
 */
export const buildServerParams = ({
  scid,
  videoCodec = 'h264',
  audio = true,
  maxSize = 0,
  maxFps = 0,
  newDisplay = null,
  flexDisplay = false,
}) => {
  const params = [
    `scid=${formatScid(scid)}`,
    'log_level=info',
    'video=true',
    `video_codec=${videoCodec}`,
    `audio=${audio ? 'true' : 'false'}`,
    'send_frame_meta=true',
    'send_stream_meta=true',
    'send_device_meta=true',
    'tunnel_forward=false',
  ];
  if (maxSize > 0) {
    params.push(`max_size=${Math.round(maxSize)}`);
  }
  if (maxFps > 0) {
    params.push(`max_fps=${Math.round(maxFps)}`);
  }
  if (newDisplay) {
    params.push(`new_display=${newDisplay}`);
  }
  if (flexDisplay) {
    params.push('flex_display=true');
  }
  return params;
};

/**
 * 构建经 `adb shell` 执行的完整参数（不含 adb 可执行文件与 `-s serial`）
 *
 * @param {object} options - 同 buildServerParams。
 * @returns {string[]}
 */
export const buildServerCommand = (options) => [
  'shell',
  `CLASSPATH=${SERVER_DEVICE_PATH}`,
  'app_process',
  '/',
  SERVER_ENTRY_CLASS,
  SERVER_VERSION,
  ...buildServerParams(options),
];
