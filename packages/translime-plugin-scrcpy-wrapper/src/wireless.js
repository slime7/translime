import { randomBytes } from 'node:crypto';
import { parseConnectOutput } from './adb';

const WIRELESS_SERIAL_RE = /^[\w.-]+:\d{1,5}$/;

const defaultDelay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

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

/**
 * 生成扫码配对的随机服务名与密码。
 * 字符集仅用字母数字，避免 WIFI QR 文本转义问题；
 * 服务名作为 mdns 实例名请求，密码为配对共享密钥
 */
export const createQrPairingSecrets = ({ random = randomBytes } = {}) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const pick = (length) => Array.from(random(length))
    .map((byte) => alphabet[byte % alphabet.length])
    .join('');
  return { name: `translime-${pick(8)}`, password: pick(10) };
};

/**
 * 构建手机「使用二维码配对设备」可扫描的二维码内容（WPA 扫码格式的 ADB 变体）
 */
export const buildQrPairingPayload = ({ name, password }) => `WIFI:T:ADB;S:${name};P:${password};;`;

const tryConnectDiscovered = async (adb, adbPath, { ip = null, knownSerials = [] }) => {
  const discovered = await adb.getMdnsConnectAddresses(adbPath).catch(() => []);
  const candidate = discovered
    .map((address) => ({ raw: address, parsed: parseAddress(address) }))
    .find(({ raw, parsed }) => parsed
      && !knownSerials.includes(raw)
      && (!ip || parsed.ip === ip));
  if (!candidate) {
    return null;
  }
  const attempt = await adb.connectDevice(adbPath, candidate.raw).then(
    (output) => parseConnectOutput(output),
    () => ({ ok: false }),
  );
  return attempt.ok ? candidate.raw : null;
};

/**
 * 配对成功后等待连接建立：
 * 轮询在线设备识别新上线的无线设备（新版 adb 配对后会自动回连），
 * 已知 IP 时（配对码流程）额外用 mDNS 发现连接端口主动连接
 */
export const connectAfterPairing = async ({
  adbPath,
  adb,
  knownSerials = [],
  ip = null,
  attempts = 10,
  pollIntervalMs = 1000,
  delay = defaultDelay,
}) => {
  const devices = await adb.listDevices(adbPath).catch(() => []);
  const fresh = devices.find((device) => isWirelessSerial(device.serial)
    && !knownSerials.includes(device.serial)
    && (!ip || parseAddress(device.serial)?.ip === ip));
  if (fresh) {
    return { ok: true, serial: fresh.serial };
  }
  const connected = await tryConnectDiscovered(adb, adbPath, { ip, knownSerials });
  if (connected) {
    return { ok: true, serial: connected };
  }
  if (attempts <= 1) {
    return {
      ok: false,
      message: '未能发现设备的连接端口，请保持手机无线调试开启；多次失败请检查电脑 adb 的 mDNS 是否可用（adb mdns check）',
    };
  }
  await delay(pollIntervalMs);
  return connectAfterPairing({
    adbPath,
    adb,
    knownSerials,
    ip,
    attempts: attempts - 1,
    pollIntervalMs,
    delay,
  });
};

const tryPairByServiceName = async (adb, adbPath, name, password) => {
  try {
    await adb.pairDevice(adbPath, name, password);
    return { ok: true };
  } catch (e) {
    if (/wrong password/i.test(String(e.message))) {
      return { ok: false, fatal: true, message: '配对密码校验失败，请重新生成二维码' };
    }
    // 服务尚未广播（手机还未扫码）等情况，继续等待
    return { ok: false };
  }
};

/**
 * 扫码配对：轮询 `adb pair <服务名> <密码>`（adb 客户端按 mdns 服务名解析手机
 * 扫码后广播的配对服务），配对成功后等待连接建立。
 * 单次调用窗口内未等到扫码时返回 pending，由 UI 决定是否继续轮询
 */
export const pairByQrServiceName = async ({
  adbPath,
  adb,
  name,
  password,
  knownSerials = [],
  attempts = 4,
  pollIntervalMs = 2000,
  connectAttempts = 10,
  delay = defaultDelay,
}) => {
  const attempt = await tryPairByServiceName(adb, adbPath, name, password);
  if (attempt.ok) {
    const connected = await connectAfterPairing({
      adbPath,
      adb,
      knownSerials,
      attempts: connectAttempts,
      pollIntervalMs,
      delay,
    });
    if (connected.ok) {
      return connected;
    }
    return { ok: false, message: `配对成功，但连接失败：${connected.message}` };
  }
  if (attempt.fatal) {
    return attempt;
  }
  if (attempts <= 1) {
    return { ok: false, pending: true };
  }
  await delay(pollIntervalMs);
  return pairByQrServiceName({
    adbPath,
    adb,
    name,
    password,
    knownSerials,
    attempts: attempts - 1,
    pollIntervalMs,
    connectAttempts,
    delay,
  });
};
