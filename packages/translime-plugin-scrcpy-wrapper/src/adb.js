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
