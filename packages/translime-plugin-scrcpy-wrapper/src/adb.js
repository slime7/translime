import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * 解析 `adb devices -l` 输出，仅保留 state 为 device 的可用设备
 */
export const parseAdbDevices = (text) => String(text ?? '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('List of devices'))
  .map((line) => {
    const tokens = line.split(/\s+/);
    const [serial, state] = tokens;
    if (!serial || !state || state !== 'device') {
      return null;
    }
    const modelToken = tokens.find((token) => token.startsWith('model:'));
    return {
      serial,
      state,
      model: modelToken ? modelToken.slice('model:'.length).replace(/_/g, ' ') : '',
    };
  })
  .filter((entry) => entry !== null);

/**
 * 解析 `pm list packages` 输出，返回排序后的包名列表
 */
export const parsePackageList = (text) => String(text ?? '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith('package:'))
  .map((line) => line.slice('package:'.length).trim())
  .filter((name) => name !== '')
  .sort();

/**
 * 解析 `wm size` 输出，优先取 Override size（存在时为实际生效分辨率），
 * 回落 Physical size；无法解析时返回 null
 */
export const parseWmSize = (text) => {
  const overrideMatch = String(text ?? '').match(/Override size:\s*(\d+)x(\d+)/);
  const physicalMatch = String(text ?? '').match(/Physical size:\s*(\d+)x(\d+)/);
  const match = overrideMatch || physicalMatch;
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) {
    return null;
  }
  return { width, height };
};

export const adbExec = async (adbPath, args, options = {}) => {
  const { timeoutMs = 10000 } = options;
  const { stdout } = await execFileAsync(adbPath, args, {
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
};

const adbExecTolerant = async (adbPath, args, { timeoutMs = 15000 } = {}) => {
  try {
    return await adbExec(adbPath, args, { timeoutMs });
  } catch (e) {
    // 部分 adb 版本命令失败也以非零退出且信息在 stderr，统一转成带输出的异常
    const detail = String(e.stderr || e.stdout || '').trim();
    throw new Error(detail || e.message);
  }
};

/**
 * 解析 `adb connect` 输出；部分版本连接失败仍以 0 退出，必须按文本判断
 */
export const parseConnectOutput = (text) => {
  const output = String(text ?? '').trim();
  if (/^(already connected|connected) to /.test(output)) {
    return { ok: true };
  }
  if (/failed to authenticate/i.test(output)) {
    return { ok: false, authError: true };
  }
  return { ok: false };
};

/**
 * 解析 `adb mdns services` 输出中 `_adb-tls-connect._tcp` 服务的连接地址，
 * 兼容行式（`instance<TAB>服务名<TAB>ip:port`）与 track-services 结构化两种输出
 */
export const parseMdnsServices = (text) => {
  const output = String(text ?? '');
  const lineRe = /_adb-tls-connect\._tcp[^\r\n]*?([\w.-]+):(\d{1,5})/g;
  const blockRe = /service:\s*"_adb-tls-connect\._tcp"[\s\S]*?ipv4:\s*"([^"]+)"[\s\S]*?port:\s*(\d{1,5})/g;
  const fromLines = Array.from(output.matchAll(lineRe)).map((match) => `${match[1]}:${match[2]}`);
  const fromBlocks = Array.from(output.matchAll(blockRe)).map((match) => `${match[1]}:${match[2]}`);
  return Array.from(new Set([...fromLines, ...fromBlocks]));
};

/**
 * 查询设备屏幕分辨率；查询失败不阻断启动，返回 null 走默认尺寸
 */
export const getDeviceResolution = async (adbPath, serial) => {
  try {
    return parseWmSize(await adbExec(adbPath, ['-s', serial, 'shell', 'wm', 'size']));
  } catch {
    return null;
  }
};

export const listDevices = async (adbPath) => parseAdbDevices(await adbExec(adbPath, ['devices', '-l']));

export const listPackages = async (adbPath, serial) => parsePackageList(
  await adbExec(adbPath, ['-s', serial, 'shell', 'pm', 'list', 'packages', '-3']),
);

export const sendKeyEvent = async (adbPath, serial, keycode) => {
  await adbExec(adbPath, ['-s', serial, 'shell', 'input', 'keyevent', String(keycode)]);
};

export const pairDevice = async (adbPath, address, pairingCode) => {
  const output = await adbExecTolerant(adbPath, ['pair', address, String(pairingCode)]);
  if (!/successfully paired/i.test(output)) {
    throw new Error(output.trim() || '配对失败');
  }
};

export const connectDevice = async (adbPath, address, options = {}) => adbExecTolerant(adbPath, ['connect', address], options);

export const getMdnsConnectAddresses = async (adbPath) => {
  try {
    return parseMdnsServices(await adbExec(adbPath, ['mdns', 'services']));
  } catch {
    // 旧版 adb 无 mdns 子命令或 mdns 被禁用时按无可发现设备处理
    return [];
  }
};
