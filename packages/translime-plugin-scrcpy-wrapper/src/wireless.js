import { parseConnectOutput } from './adb';

const WIRELESS_SERIAL_RE = /^[\w.-]+:\d{1,5}$/;

/**
 * 无线调试设备的 serial 为 `IP:端口` 形式（adb connect 后即以此作为设备序列号）
 */
export const isWirelessSerial = (serial) => WIRELESS_SERIAL_RE.test(String(serial ?? ''));

/**
 * 解析 `IP:端口` 形式的无线调试地址，非法输入返回 null
 */
export const parseAddress = (text) => {
  const value = String(text ?? '').trim();
  if (!WIRELESS_SERIAL_RE.test(value)) {
    return null;
  }
  const separator = value.lastIndexOf(':');
  const ip = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (!ip || port < 1 || port > 65535) {
    return null;
  }
  return { ip, port };
};

export const formatAddress = ({ ip, port }) => `${ip}:${port}`;

/**
 * 合并 adb 在线设备与已保存的无线设备：
 * 在线的无线 serial 标记 wireless 并回填已保存的机型名，
 * 已保存但离线的设备以未连接状态追加，保证设备菜单始终可选
 */
export const mergeWirelessDevices = (devices, stored = []) => {
  const online = (devices ?? []).map((device) => {
    if (!isWirelessSerial(device.serial)) {
      return device;
    }
    const saved = stored.find((item) => item.serial === device.serial);
    return {
      ...device,
      model: device.model || saved?.model || '',
      wireless: true,
      connected: true,
      stored: Boolean(saved),
    };
  });
  const onlineSerials = new Set(online.map((device) => device.serial));
  const offline = stored
    .filter((item) => !onlineSerials.has(item.serial))
    .map((item) => ({
      serial: item.serial,
      state: 'offline',
      model: item.model || '',
      wireless: true,
      connected: false,
      stored: true,
    }));
  return [...online, ...offline];
};

const buildConnectFailMessage = (serial, attempt) => {
  if (attempt?.authError) {
    return `无法连接无线设备 ${serial}：配对信息已失效，请重新配对`;
  }
  return `无法连接无线设备 ${serial}：请确认手机已开启无线调试且与电脑处于同一网络；端口可能已变化，可在手机「无线调试」页面查看最新的 IP 地址和端口`;
};

/**
 * 依次尝试候选地址连接，返回第一个连上的地址；全部失败返回 null
 */
const connectFirstCandidate = async (adb, adbPath, candidates) => {
  if (candidates.length === 0) {
    return null;
  }
  const [first, ...rest] = candidates;
  const attempt = await adb.connectDevice(adbPath, first).then(
    (output) => parseConnectOutput(output),
    () => ({ ok: false }),
  );
  if (attempt.ok) {
    return first;
  }
  return connectFirstCandidate(adb, adbPath, rest);
};

/**
 * 确保无线设备处于已连接状态：
 * 已在线直接返回；否则按传入地址连接，失败后用 mDNS 发现的当前端口重连
 * （高版本安卓每次开关无线调试或重启后端口都会变化），并回报端口变化
 *
 * adb 注入 { listDevices, connectDevice, getMdnsConnectAddresses } 以便单测
 */
export const ensureWirelessConnected = async ({ serial, adbPath, adb }) => {
  const online = await adb.listDevices(adbPath);
  if (online.some((device) => device.serial === serial && device.state === 'device')) {
    return { ok: true, serial };
  }
  const attempt = await adb.connectDevice(adbPath, serial).then(
    (output) => parseConnectOutput(output),
    (e) => ({ ok: false, message: e.message }),
  );
  if (attempt.ok) {
    return { ok: true, serial };
  }
  const parsed = parseAddress(serial);
  if (!parsed) {
    return { ok: false, message: attempt.message || buildConnectFailMessage(serial, attempt) };
  }
  const discovered = await adb.getMdnsConnectAddresses(adbPath);
  const candidates = discovered
    .filter((address) => address !== serial && parseAddress(address)?.ip === parsed.ip);
  const connected = await connectFirstCandidate(adb, adbPath, candidates);
  if (connected) {
    return { ok: true, serial: connected, portChanged: true };
  }
  return { ok: false, message: buildConnectFailMessage(serial, attempt) };
};
