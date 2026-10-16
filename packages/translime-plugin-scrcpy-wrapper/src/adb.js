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
 * 解析 dumpsys window 或 dumpsys display 输出中的当前屏幕显示矩形（兼容旋转）
 */
export const parseDisplayResolution = (text) => {
  const str = String(text ?? '');
  const rectMatch = str.match(/mCurrentDisplayRect=Rect\(0,\s*0\s*-\s*(\d+),\s*(\d+)\)/);
  if (rectMatch) {
    const width = Number(rectMatch[1]);
    const height = Number(rectMatch[2]);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  const curMatch = str.match(/\bcur=(\d+)x(\d+)\b/);
  if (curMatch) {
    const width = Number(curMatch[1]);
    const height = Number(curMatch[2]);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  const initMatch = str.match(/init=(\d+)x(\d+)/);
  const rotMatch = str.match(/mCurrentRotation=ROTATION_(\d+)/);
  if (initMatch && rotMatch) {
    let width = Number(initMatch[1]);
    let height = Number(initMatch[2]);
    const rot = rotMatch[1];
    if ((rot === '90' || rot === '270') && width > 0 && height > 0) {
      const temp = width;
      width = height;
      height = temp;
    }
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  return null;
};

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
 * 从 adb mdns 服务实例名提取硬件序列号：
 * 实例名通常形如 `adb-<serial>-<6位随机字符>`，部分环境尾随序号 ` (2)`
 */
export const extractSerialFromMdnsInstance = (instance) => {
  const str = String(instance ?? '').trim();
  const cleaned = str.replace(/\s*\(\d+\)$/, '');
  const match = cleaned.match(/^adb-(.+)-[A-Za-z0-9]{6}$/);
  if (match) {
    return match[1];
  }
  const fallback = cleaned.match(/^adb-([^-]+)/);
  if (fallback) {
    return fallback[1];
  }
  return null;
};

/**
 * 解析 `adb mdns services` 输出为结构化记录列表：
 * 每项包含 `{ instance, address, ip, port, serial }`
 */
export const parseMdnsServiceRecords = (text) => {
  const output = String(text ?? '');
  const records = [];
  const lines = output.split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('List of')) {
      return;
    }
    const connectIdx = trimmed.indexOf('_adb-tls-connect._tcp');
    if (connectIdx !== -1) {
      const before = trimmed.slice(0, connectIdx).trim();
      const after = trimmed.slice(connectIdx + '_adb-tls-connect._tcp'.length).trim();
      const addrMatch = after.match(/([\w.-]+):(\d{1,5})/);
      if (addrMatch) {
        records.push({
          instance: before,
          address: `${addrMatch[1]}:${addrMatch[2]}`,
          ip: addrMatch[1],
          port: Number(addrMatch[2]),
          serial: extractSerialFromMdnsInstance(before),
        });
      }
    }
  });
  const blockRe = /instance:\s*"([^"]+)"[\s\S]*?service:\s*"_adb-tls-connect\._tcp"[\s\S]*?ipv4:\s*"([^"]+)"[\s\S]*?port:\s*(\d{1,5})/g;
  Array.from(output.matchAll(blockRe)).forEach((match) => {
    const instance = match[1];
    const ip = match[2];
    const port = Number(match[3]);
    records.push({
      instance,
      address: `${ip}:${port}`,
      ip,
      port,
      serial: extractSerialFromMdnsInstance(instance),
    });
  });
  const seen = new Set();
  return records.filter((rec) => {
    if (seen.has(rec.address)) {
      return false;
    }
    seen.add(rec.address);
    return true;
  });
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
 * 查询设备当前屏幕实际显示尺寸（包含横竖屏旋转适配）；查询失败不阻断启动，返回 null 走默认尺寸
 */
export const getDeviceResolution = async (adbPath, serial) => {
  try {
    const windowInfo = await adbExec(adbPath, ['-s', serial, 'shell', 'dumpsys', 'window'], { timeoutMs: 5000 });
    const parsed = parseDisplayResolution(windowInfo);
    if (parsed) {
      return parsed;
    }
  } catch {
    // 忽略异常，尝试 display
  }
  try {
    const displayInfo = await adbExec(adbPath, ['-s', serial, 'shell', 'dumpsys', 'display'], { timeoutMs: 5000 });
    const parsed = parseDisplayResolution(displayInfo);
    if (parsed) {
      return parsed;
    }
  } catch {
    // 忽略异常，尝试 wm size
  }
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

export const sendKeyEvent = async (adbPath, serial, keycode, options = {}) => {
  const { displayId = 0 } = options;
  const args = ['-s', serial, 'shell', 'input'];
  if (displayId !== null && displayId !== undefined) {
    args.push('-d', String(displayId));
  }
  args.push('keyevent', String(keycode));
  await adbExec(adbPath, args);
};

export const launchApp = async (adbPath, serial, pkg) => {
  if (!pkg) {
    return;
  }
  try {
    await adbExec(adbPath, ['-s', serial, 'shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
  } catch {
    await adbExec(adbPath, ['-s', serial, 'shell', 'monkey', '-p', pkg, '1']);
  }
};

export const pairDevice = async (adbPath, address, pairingCode) => {
  const output = await adbExecTolerant(adbPath, ['pair', address, String(pairingCode)]);
  if (!/successfully paired/i.test(output)) {
    throw new Error(output.trim() || '配对失败');
  }
};

export const connectDevice = async (adbPath, address, options = {}) => adbExecTolerant(adbPath, ['connect', address], options);

export const disconnectDevice = async (adbPath, address, options = {}) => adbExecTolerant(adbPath, ['disconnect', address], options).catch(() => '');

export const KEYCODE_HOME = 3;
export const KEYCODE_BACK = 4;
export const KEYCODE_POWER = 26;
export const KEYCODE_APP_SWITCH = 187;
export const KEYCODE_SLEEP = 223;
export const KEYCODE_WAKEUP = 224;

/**
 * 解析 dumpsys activity activities 或 dumpsys window 输出中的前台应用包名
 */
export const parseForegroundPackage = (text) => {
  const str = String(text ?? '');
  const resumedMatch = str.match(
    /(?:mResumedActivity|ResumedActivity|topResumedActivity)[=:\s]+ActivityRecord\{[^\r\n]*?\s+([a-zA-Z0-9_.]+)\//,
  );
  if (resumedMatch) {
    return resumedMatch[1];
  }
  const focusMatch = str.match(
    /(?:mCurrentFocus|mFocusedApp|mFocusedWindow)[=:\s]+(?:Window|AppWindowToken)\{[^\r\n]*?\s+([a-zA-Z0-9_.]+)\//,
  );
  if (focusMatch) {
    return focusMatch[1];
  }
  return null;
};

/**
 * 解析 dumpsys power 输出中的屏幕唤醒状态（awake / asleep / dozing 等）
 */
export const parseWakefulness = (text) => {
  const match = String(text ?? '').match(/mWakefulness=([a-zA-Z]+)/);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase();
};

export const getForegroundPackage = async (adbPath, serial) => {
  try {
    const stdout = await adbExec(adbPath, ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities']);
    return parseForegroundPackage(stdout);
  } catch {
    return null;
  }
};

export const getDefaultLauncherPackage = async (adbPath, serial) => {
  try {
    const stdout = await adbExec(adbPath, [
      '-s', serial, 'shell', 'cmd', 'package', 'resolve-activity', '--brief',
      '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.HOME',
    ]);
    const lines = stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1].trim();
    const match = lastLine.match(/^([a-zA-Z0-9_.]+)\//);
    if (match) {
      return match[1];
    }
  } catch {
    // 忽略异常，回落到常见特征判定
  }
  return null;
};

export const isLauncherPackage = (pkg, defaultLauncher = null) => {
  if (!pkg) {
    return true;
  }
  if (defaultLauncher && pkg === defaultLauncher) {
    return true;
  }
  const lower = pkg.toLowerCase();
  return lower.includes('launcher') || lower.includes('.home') || lower.includes('quickstep');
};

export const getForegroundApp = async (adbPath, serial, options = {}) => {
  const { defaultLauncher = null } = options;
  const pkg = await getForegroundPackage(adbPath, serial);
  if (!pkg || isLauncherPackage(pkg, defaultLauncher)) {
    return null;
  }
  return pkg;
};

export const getWakefulness = async (adbPath, serial) => {
  try {
    const stdout = await adbExec(adbPath, ['-s', serial, 'shell', 'dumpsys', 'power']);
    return parseWakefulness(stdout);
  } catch {
    return null;
  }
};

export const toggleScreen = async (adbPath, serial) => {
  const wakefulness = await getWakefulness(adbPath, serial);
  let keycode = KEYCODE_POWER;
  if (wakefulness === 'awake') {
    keycode = KEYCODE_SLEEP;
  } else if (wakefulness) {
    keycode = KEYCODE_WAKEUP;
  }
  await sendKeyEvent(adbPath, serial, keycode);
  return { keycode, wakefulness };
};

/**
 * 解析 `settings get` 输出中的整数设置值；键不存在或非整数时返回 null
 */
export const parseSystemSetting = (text) => {
  const trimmed = String(text ?? '').trim();
  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
};

/**
 * 读取旋转相关系统设置（accelerometer_rotation / user_rotation）；
 * 读不到的键返回 null，恢复时跳过对应键
 */
export const getSystemRotationState = async (adbPath, serial) => {
  const readSetting = async (key) => {
    try {
      const stdout = await adbExec(
        adbPath,
        ['-s', serial, 'shell', 'settings', 'get', 'system', key],
        { timeoutMs: 5000 },
      );
      return parseSystemSetting(stdout);
    } catch {
      return null;
    }
  };
  const [accelerometer, user] = await Promise.all([
    readSetting('accelerometer_rotation'),
    readSetting('user_rotation'),
  ]);
  return { accelerometer, user };
};

/**
 * 锁定设备旋转方向：0 竖屏、1 横屏；锁定期间关闭自动旋转
 */
export const setDeviceRotation = async (adbPath, serial, rotation) => {
  await adbExec(adbPath, [
    '-s', serial, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0',
  ]);
  await adbExec(adbPath, [
    '-s', serial, 'shell', 'settings', 'put', 'system', 'user_rotation', String(rotation),
  ]);
};

/**
 * 会话结束前恢复锁定前的旋转设置；无记录的键保持原样
 */
export const restoreDeviceRotation = async (adbPath, serial, state) => {
  if (!state) {
    return;
  }
  if (state.accelerometer !== null) {
    await adbExec(adbPath, [
      '-s', serial, 'shell', 'settings', 'put', 'system',
      'accelerometer_rotation', String(state.accelerometer),
    ]);
  }
  if (state.user !== null) {
    await adbExec(adbPath, [
      '-s', serial, 'shell', 'settings', 'put', 'system', 'user_rotation', String(state.user),
    ]);
  }
};

/**
 * 计算横竖屏切换的下一个锁定方向：竖屏(0) → 横屏(1) → 竖屏
 */
export const nextForcedRotation = (current) => (current === 1 ? 0 : 1);

export const getMdnsConnectAddresses = async (adbPath) => {
  try {
    return parseMdnsServices(await adbExec(adbPath, ['mdns', 'services']));
  } catch {
    // 旧版 adb 无 mdns 子命令或 mdns 被禁用时按无可发现设备处理
    return [];
  }
};

export const getMdnsServiceRecords = async (adbPath) => {
  try {
    return parseMdnsServiceRecords(await adbExec(adbPath, ['mdns', 'services']));
  } catch {
    return [];
  }
};

/**
 * 查询设备的硬件序列号（ro.serialno），获取失败时返回 null
 */
export const getDeviceHardwareSerial = async (adbPath, serial) => {
  try {
    const out = await adbExec(adbPath, ['-s', serial, 'shell', 'getprop', 'ro.serialno'], { timeoutMs: 3000 });
    const trimmed = String(out ?? '').trim();
    if (trimmed && !trimmed.includes('\n') && !trimmed.includes(' ') && trimmed.length >= 3) {
      return trimmed;
    }
  } catch {
    // 忽略异常
  }
  return null;
};
