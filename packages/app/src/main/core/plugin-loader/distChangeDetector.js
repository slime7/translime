import fs from 'node:fs';
import path from 'node:path';

/**
 * dist 构建产物变化的判定器。
 *
 * Windows 的 `fs.watch` 对文件读取（访问时间等属性变化）同样抛出 change
 * 事件，事件类型与文件名和真实写入完全一致；打开插件 UI 时主进程会读取
 * `dist/ui.esm.js`，若不校验会把这次读取误判为构建产物变化并重启插件。
 * 因此每个监听事件都必须先与创建时的产物快照对比 mtime/size，
 * 只有真实变化才允许触发重启。
 */

const statEntry = (entryPath) => {
  try {
    const stat = fs.statSync(entryPath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
};

const toRelKey = (filename) => filename.split('\\').join('/');

const replaceSnapshot = (snapshot, next) => {
  snapshot.clear();
  next.forEach((value, key) => snapshot.set(key, value));
};

const snapshotsEqual = (a, b) => {
  if (a.size !== b.size) {
    return false;
  }
  return [...a.entries()].every(([rel, info]) => {
    const other = b.get(rel);
    return other && other.mtimeMs === info.mtimeMs && other.size === info.size;
  });
};

/**
 * 创建 dist 变化判定器，创建时记录 dist 内全部条目的 mtime/size 快照。
 *
 * @param {object} options - 配置项。
 * @param {string} options.distPath - 被监听的 dist 目录。
 * @returns {{handleWatchEvent: (filename?: string) => boolean}} 判定器。
 */
const createDistChangeDetector = ({ distPath }) => {
  const snapshot = new Map();

  const scan = () => {
    const next = new Map();
    const walk = (dir, prefix) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      entries.forEach((entry) => {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        const entryPath = path.join(dir, entry.name);
        const stat = statEntry(entryPath);
        if (stat) {
          next.set(rel, stat);
        }
        if (entry.isDirectory()) {
          walk(entryPath, rel);
        }
      });
    };
    walk(distPath, '');
    return next;
  };

  replaceSnapshot(snapshot, scan());

  /**
   * 判定一次 fs.watch 事件是否对应真实的产物变化，并同步快照。
   *
   * @param {string|undefined} filename - fs.watch 回调给出的相对路径，
   *   部分事件可能不带文件名，此时退化为全量重扫对比。
   * @returns {boolean} 是否应触发重启。
   */
  const handleWatchEvent = (filename) => {
    if (!filename) {
      const next = scan();
      const changed = !snapshotsEqual(next, snapshot);
      replaceSnapshot(snapshot, next);
      return changed;
    }
    const rel = toRelKey(filename);
    const prev = snapshot.get(rel);
    const now = statEntry(path.join(distPath, filename));
    if (!prev && !now) {
      // 快照外的条目来了又走（如构建器的临时文件），视为噪音
      return false;
    }
    if (prev && !now) {
      snapshot.delete(rel);
      return true;
    }
    const changed = !prev
      || now.mtimeMs !== prev.mtimeMs
      || now.size !== prev.size;
    snapshot.set(rel, now);
    return changed;
  };

  return { handleWatchEvent };
};

export default createDistChangeDetector;
