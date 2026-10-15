import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * 解析 adb 命令：设置项显式路径 > 旧版 scrcpy 设置项同目录的 adb > PATH 探测 > 裸命令名
 */
export const resolveAdbPath = (options = {}) => {
  const {
    settingValue,
    legacyScrcpySettingValue,
    existsSync = fs.existsSync,
    platform = process.platform,
    ...searchOptions
  } = options;
  const explicit = normalizeFileSetting(settingValue);
  if (explicit) {
    return explicit;
  }
  const legacyScrcpy = normalizeFileSetting(legacyScrcpySettingValue);
  if (legacyScrcpy) {
    const ext = platform === 'win32' ? '.exe' : '';
    const candidate = path.join(path.dirname(legacyScrcpy), `adb${ext}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const found = searchPathFor('adb', { existsSync, platform, ...searchOptions });
  if (found) {
    return found;
  }
  return 'adb';
};

/**
 * 捆绑的 scrcpy-server 文件路径（随插件发布，位于插件根目录 bin/ 下）
 */
export const bundledServerPath = () => fileURLToPath(new URL('../bin/scrcpy-server', import.meta.url));

/**
 * 解析 scrcpy-server 文件：设置项显式路径（存在时）> 捆绑文件；
 * 两者都不可用时返回显式路径（缺失时启动阶段会给出明确报错），完全未配置返回 null
 */
export const resolveServerPath = (options = {}) => {
  const { settingValue, existsSync = fs.existsSync } = options;
  const explicit = normalizeFileSetting(settingValue);
  if (explicit && existsSync(explicit)) {
    return explicit;
  }
  const bundled = bundledServerPath();
  if (existsSync(bundled)) {
    return bundled;
  }
  return explicit;
};
