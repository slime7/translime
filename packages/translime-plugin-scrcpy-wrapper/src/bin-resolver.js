import fs from 'node:fs';
import path from 'node:path';

/**
 * file 类型设置项可能以数组（多选遗留格式）或字符串保存，统一取第一个有效路径
 */
export const normalizeFileSetting = (value) => {
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' && item.trim() !== '');
    return first ?? null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  return null;
};

/**
 * 在 PATH 各目录中探测命令的完整路径，找不到返回 null
 */
export const searchPathFor = (command, options = {}) => {
  const {
    envPath = process.env.PATH,
    existsSync = fs.existsSync,
    platform = process.platform,
  } = options;
  if (!envPath) {
    return null;
  }
  const ext = platform === 'win32' ? '.exe' : '';
  const dirs = envPath.split(path.delimiter).filter((dir) => dir !== '');
  const found = dirs
    .map((dir) => path.join(dir, `${command}${ext}`))
    .find((full) => existsSync(full));
  return found ?? null;
};

/**
 * 解析 scrcpy 命令：设置项路径 > PATH 探测 > 裸命令名
 * command 用于 spawn，resolved 为实际所在路径（可能为 null，供 adb 同目录探测）
 */
export const resolveScrcpyPath = (options = {}) => {
  const { settingValue, ...searchOptions } = options;
  const settingPath = normalizeFileSetting(settingValue);
  if (settingPath) {
    return { command: settingPath, resolved: settingPath };
  }
  const found = searchPathFor('scrcpy', searchOptions);
  if (found) {
    return { command: found, resolved: found };
  }
  return { command: 'scrcpy', resolved: null };
};

/**
 * 解析 adb 命令：scrcpy 发行包自带的同目录 adb.exe 优先，否则回落 PATH 中的 adb
 */
export const resolveAdbPath = (options = {}) => {
  const {
    scrcpyResolved,
    existsSync = fs.existsSync,
    platform = process.platform,
  } = options;
  if (scrcpyResolved) {
    const ext = platform === 'win32' ? '.exe' : '';
    const candidate = path.join(path.dirname(scrcpyResolved), `adb${ext}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return 'adb';
};
