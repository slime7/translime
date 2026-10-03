import fs from 'node:fs';
import path from 'node:path';

/**
 * 存档目录文件监控：
 * - 每个目录一个 fs.watch(recursive) 监听，事件按目录防抖合并后回调
 * - 同步期间抑制回调（直通同步回写存档目录会再次触发事件），释放后的静默期内事件同样忽略；
 *   抑制期内发生过事件的目录在释放后补发一次，避免真实变更被静默丢弃
 * - pause/resume 供全屏游戏场景整体挂起：暂停期事件只记标记，恢复后统一补发一次
 * - recursive 监听在 Windows / macOS 原生支持；个别平台不支持时监听失败走 onError，由外部降级
 */
const createSaveWatcher = ({
  debounceMs = 2000,
  quietMs = 3000,
  onChange = () => {},
  onError = () => {},
} = {}) => {
  let closed = false;
  let paused = false;
  const watchers = new Map(); // key -> { dir, watcher }
  const timers = new Map(); // key -> timeout
  const suppressedUntil = new Map(); // key -> 时间戳（Infinity 表示同步进行中）
  const trailingDirty = new Set(); // 抑制期内发生过事件的目录，释放后补发
  const pausedKeys = new Set(); // 因 pause 进入抑制的目录，与同步抑制互不干扰

  const keyOf = (dir) => {
    const resolved = path.resolve(dir);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };

  const clearTimer = (key) => {
    const timer = timers.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.delete(key);
    }
  };

  const stop = (key) => {
    const entry = watchers.get(key);
    if (entry) {
      entry.watcher.close();
      watchers.delete(key);
    }
    clearTimer(key);
  };

  const isSuppressed = (key) => (suppressedUntil.get(key) || 0) > Date.now();

  const emitChange = (dir, key) => {
    if (!closed && !isSuppressed(key)) {
      onChange(dir);
    }
  };

  const schedule = (dir, key) => {
    if (isSuppressed(key)) {
      trailingDirty.add(key);
      return;
    }
    clearTimer(key);
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      emitChange(dir, key);
    }, debounceMs));
  };

  const watchDir = (dir) => {
    const key = keyOf(dir);
    let watcher;
    try {
      watcher = fs.watch(dir, { recursive: true }, () => schedule(dir, key));
    } catch (e) {
      onError(dir, e);
      return;
    }
    watcher.on('error', (e) => {
      // 目录被删除等不可恢复错误：移除监听并上报，由外部重建监控集
      stop(key);
      suppressedUntil.delete(key);
      trailingDirty.delete(key);
      onError(dir, e);
    });
    watchers.set(key, { dir, watcher });
  };

  return {
    /** 将监控集对齐到 dirs：增删差异启停，未变化目录的监听与防抖状态保持不变 */
    setDirs(dirs) {
      if (closed) {
        return;
      }
      const nextKeys = new Set();
      (dirs || []).forEach((dir) => {
        const key = keyOf(dir);
        nextKeys.add(key);
        if (!watchers.has(key)) {
          watchDir(dir);
          if (paused) {
            // 暂停期间新增的目录同样进入挂起
            clearTimer(key);
            suppressedUntil.set(key, Infinity);
            pausedKeys.add(key);
          }
        }
      });
      [...watchers.keys()].forEach((key) => {
        if (!nextKeys.has(key)) {
          stop(key);
          suppressedUntil.delete(key);
          trailingDirty.delete(key);
          pausedKeys.delete(key);
        }
      });
    },

    /** 全屏程序开始：全部目录挂起，防抖中的未决变更转入补发队列 */
    pause() {
      if (paused || closed) {
        return;
      }
      paused = true;
      [...watchers.keys()].forEach((key) => {
        if (timers.has(key)) {
          clearTimer(key);
          trailingDirty.add(key);
        }
        if (suppressedUntil.get(key) !== Infinity) {
          suppressedUntil.set(key, Infinity);
          pausedKeys.add(key);
        }
      });
    },

    /** 全屏退出：解除挂起，暂停期间发生过事件的目录在静默期后各补发一次。
     *  正被同步抑制（beginSuppress）接管、或已被同步结束的目录不在恢复范围 */
    resume() {
      if (!paused) {
        return;
      }
      paused = false;
      [...pausedKeys].forEach((key) => {
        pausedKeys.delete(key);
        const entry = watchers.get(key);
        if (!entry || suppressedUntil.get(key) !== Infinity) {
          return;
        }
        suppressedUntil.set(key, Date.now() + quietMs);
        if (trailingDirty.has(key)) {
          trailingDirty.delete(key);
          clearTimer(key);
          timers.set(key, setTimeout(() => {
            timers.delete(key);
            emitChange(entry.dir, key);
          }, quietMs));
        }
      });
    },

    /** 同步开始：清掉待触发回调并进入抑制，抑制期内事件只记标记 */
    beginSuppress(dir) {
      const key = keyOf(dir);
      clearTimer(key);
      trailingDirty.delete(key);
      suppressedUntil.set(key, Infinity);
    },

    /** 同步结束：转入静默期宽限（rclone 余量回写），期间发生事件的补发一次 */
    endSuppress(dir) {
      const key = keyOf(dir);
      if (suppressedUntil.get(key) !== Infinity) {
        suppressedUntil.delete(key);
        return;
      }
      suppressedUntil.set(key, Date.now() + quietMs);
      if (trailingDirty.has(key)) {
        trailingDirty.delete(key);
        const entry = watchers.get(key);
        if (entry) {
          clearTimer(key);
          timers.set(key, setTimeout(() => {
            timers.delete(key);
            emitChange(entry.dir, key);
          }, quietMs));
        }
      }
    },

    close() {
      closed = true;
      [...watchers.keys()].forEach(stop);
      suppressedUntil.clear();
      trailingDirty.clear();
      pausedKeys.clear();
    },
  };
};

export default createSaveWatcher;
