import path from 'node:path';
import { readdir } from './fs-wrapper';

// 手动添加的自定义目录递归枚举上限，防止把整个盘符当成存档目录
const MAX_CUSTOM_DIR_FILES = 1000;
const MAX_CUSTOM_DIR_DEPTH = 8;

/**
 * 递归收集目录下的文件（相对路径，/ 分隔），超过上限后停止并标记截断
 * @param {string} dir
 * @param {{maxFiles?: number, maxDepth?: number}} [options]
 * @returns {Promise<{files: string[], truncated: boolean}>}
 */
export const listDirFiles = async (dir, options = {}) => {
  const maxFiles = options.maxFiles ?? MAX_CUSTOM_DIR_FILES;
  const maxDepth = options.maxDepth ?? MAX_CUSTOM_DIR_DEPTH;
  const files = [];
  let truncated = false;

  const walk = async (current, prefix, depth) => {
    if (files.length >= maxFiles || depth > maxDepth) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (e) {
      console.warn(`读取目录失败，跳过: ${current}`, e);
      return;
    }

    entries
      .filter((entry) => entry.isFile())
      .forEach((entry) => {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(prefix ? `${prefix}/${entry.name}` : entry.name);
      });

    if (files.length >= maxFiles) {
      truncated = true;
      return;
    }

    await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => walk(
        path.join(current, entry.name),
        prefix ? `${prefix}/${entry.name}` : entry.name,
        depth + 1,
      )));
  };

  await walk(dir, '', 0);
  return { files, truncated };
};

/**
 * 规范化自定义目录路径用于去重比较
 * @param {string} dir
 */
export const normalizeCustomDir = (dir) => {
  if (typeof dir !== 'string' || dir.trim() === '') {
    return '';
  }
  const resolved = path.resolve(dir.trim());
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

/**
 * 由游戏名生成稳定的手动游戏 ID（custom-<hash>），用作伪 appid：
 * 备份目录名、排除列表与 IPC 载荷都以它为键，重命名游戏会视为新游戏
 * @param {string} gameName
 * @returns {string}
 */
export const hashGameKey = (gameName) => {
  const lower = typeof gameName === 'string' ? gameName.trim().toLowerCase() : '';
  const HASH_MODULUS = 4294967296;
  let hash = 5381;
  lower.split('').forEach((char) => {
    // Math.imul 做 32 位乘法模拟 djb2，模运算归一为非负数（仓库 lint 禁用位运算符）
    const mixed = (Math.imul(hash, 33) + char.charCodeAt(0)) % HASH_MODULUS;
    hash = (mixed + HASH_MODULUS) % HASH_MODULUS;
  });
  return `custom-${hash.toString(36)}`;
};

/**
 * 游戏名匹配键（大小写不敏感、去首尾空白），用于把手动目录合并进扫描到的游戏
 * @param {string} gameName
 * @returns {string}
 */
export const normalizeGameNameKey = (gameName) => (
  typeof gameName === 'string' ? gameName.trim().toLowerCase() : ''
);
