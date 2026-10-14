import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * 解析 `adb devices -l` 输出，仅保留 state 为 device 的可用设备
 */
export const parseAdbDevices = (text) => {
  const devices = [];
  const lines = String(text ?? '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('List of devices')) {
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    const [serial, state] = tokens;
    if (!serial || !state || state !== 'device') {
      continue;
    }
    const modelToken = tokens.find((token) => token.startsWith('model:'));
    const model = modelToken ? modelToken.slice('model:'.length).replace(/_/g, ' ') : '';
    devices.push({ serial, state, model });
  }
  return devices;
};

/**
 * 解析 `pm list packages` 输出，返回排序后的包名列表
 */
export const parsePackageList = (text) => {
  const packages = [];
  const lines = String(text ?? '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('package:')) {
      continue;
    }
    const name = trimmed.slice('package:'.length).trim();
    if (name) {
      packages.push(name);
    }
  }
  packages.sort();
  return packages;
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

export const listDevices = async (adbPath) => parseAdbDevices(await adbExec(adbPath, ['devices', '-l']));

export const listPackages = async (adbPath, serial) => parsePackageList(
  await adbExec(adbPath, ['-s', serial, 'shell', 'pm', 'list', 'packages', '-3']),
);

export const sendKeyEvent = async (adbPath, serial, keycode) => {
  await adbExec(adbPath, ['-s', serial, 'shell', 'input', 'keyevent', String(keycode)]);
};
