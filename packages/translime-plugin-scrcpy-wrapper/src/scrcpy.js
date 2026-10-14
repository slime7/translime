import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, screen } from 'electron';
import { setupMdeWindow } from 'translime-sdk';
import { findWindowByTitle, mountSdlToElectron, setupBlurResizeHooks } from './win32';
import { resolveAdbPath, resolveScrcpyPath } from './bin-resolver';
import { buildScrcpyArgs, nextWindowTitle } from './scrcpy-args';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// 画面窗口底部控制条的 CSS 高度，需与 wrapper-app.vue 中 .control-bar 保持一致
export const BAR_CSS_HEIGHT = 48;

const sessions = new Map();

const getBarPhysicalHeight = (win) => {
  try {
    const display = screen.getDisplayMatching(win.getBounds());
    return BAR_CSS_HEIGHT * display.scaleFactor;
  } catch {
    return BAR_CSS_HEIGHT;
  }
};

const createWrapperWindow = ({ title, sessionId }) => {
  const win = new BrowserWindow({
    width: 420,
    height: 900,
    minWidth: 200,
    minHeight: 240,
    resizable: true,
    backgroundColor: '#000000',
    title,
    show: true,
    webPreferences: {
      preload: path.join(dirname, 'wrapper-preload.cjs.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  setupMdeWindow(win, { injectTheme: true, syncTheme: true, bootstrap: true });
  win.loadFile(path.join(dirname, 'wrapper.html'), { query: { session: sessionId } });
  return win;
};

const waitForScrcpyWindow = (title, options = {}) => {
  const { intervalMs = 100, timeoutMs = 15000, shouldAbort } = options;
  return new Promise((resolve, reject) => {
    // 先同步校验一次 koffi 绑定可用性，失败立即返回而不是在轮询中抛出
    try {
      findWindowByTitle(title);
    } catch (e) {
      reject(e);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (shouldAbort()) {
        clearInterval(timer);
        reject(new Error('scrcpy 进程已退出'));
        return;
      }
      const hwnd = findWindowByTitle(title);
      if (hwnd) {
        clearInterval(timer);
        resolve(hwnd);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`等待 scrcpy 窗口超时（${timeoutMs}ms）`));
      }
    }, intervalMs);
  });
};

const killProcessTree = (proc) => {
  if (process.platform === 'win32' && proc.pid) {
    spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }
  proc.kill();
};

const destroySession = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  sessions.delete(sessionId);
  if (session.hooks) {
    session.hooks.destroy();
  }
  const { proc } = session;
  if (proc.exitCode === null && !session.spawnError) {
    killProcessTree(proc);
  }
};

/**
 * 启动一个 scrcpy 会话：spawn 进程、创建 wrapper 窗口、等待并挂载 SDL 窗口
 */
export const launchSession = async (options = {}) => {
  const {
    mode = 'mirror',
    serial,
    pkg = null,
    settingValue = null,
    logger = console,
  } = options;
  if (!serial) {
    throw new Error('缺少设备 serial');
  }

  const scrcpyInfo = resolveScrcpyPath({ settingValue });
  const adbPath = resolveAdbPath({ scrcpyResolved: scrcpyInfo.resolved });
  const title = nextWindowTitle();
  const sessionId = `session-${title}`;
  const args = buildScrcpyArgs({
    mode,
    serial,
    pkg,
    title,
  });
  const wrapperTitle = pkg ? `${pkg} - ${serial}` : `${serial} 画面`;

  // scrcpy 与本插件使用同一个 adb，避免两个版本的 adb server 相互踢下线
  const env = { ...process.env };
  if (scrcpyInfo.resolved && adbPath !== 'adb') {
    env.ADB = adbPath;
  }

  const proc = spawn(scrcpyInfo.command, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  const win = createWrapperWindow({ title: wrapperTitle, sessionId });
  const session = {
    id: sessionId,
    serial,
    mode,
    pkg,
    title,
    proc,
    win,
    adbPath,
    hooks: null,
    spawnError: null,
  };
  sessions.set(sessionId, session);

  let winClosed = false;
  win.on('closed', () => {
    winClosed = true;
    destroySession(sessionId);
  });
  const forwardLog = (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      logger.info(`[scrcpy:${sessionId}] ${text}`);
    }
  };
  proc.stdout?.on('data', forwardLog);
  proc.stderr?.on('data', forwardLog);
  proc.on('error', (e) => {
    session.spawnError = e;
  });
  proc.on('exit', () => {
    if (!winClosed) {
      win.destroy();
    }
    destroySession(sessionId);
  });

  try {
    const hwnd = await waitForScrcpyWindow(title, {
      shouldAbort: () => proc.exitCode !== null || session.spawnError !== null,
    });
    mountSdlToElectron(win, hwnd, { barPhysicalHeight: getBarPhysicalHeight(win) });
    session.hooks = setupBlurResizeHooks(win, hwnd, {
      getBarPhysicalHeight: () => getBarPhysicalHeight(win),
    });
    return { sessionId, title };
  } catch (e) {
    if (!winClosed && !win.isDestroyed()) {
      win.destroy();
    }
    destroySession(sessionId);
    if (session.spawnError) {
      throw new Error(`无法启动 scrcpy（${scrcpyInfo.command}）：${session.spawnError.message}`);
    }
    throw e;
  }
};

export const getSession = (sessionId) => sessions.get(sessionId) ?? null;

export const closeSession = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }
  if (!session.win.isDestroyed()) {
    session.win.destroy();
  } else {
    destroySession(sessionId);
  }
  return true;
};

export const closeAllSessions = () => {
  Array.from(sessions.keys()).forEach((sessionId) => {
    closeSession(sessionId);
  });
};
