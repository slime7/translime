import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, session as electronSession, screen } from 'electron';
import { setupMdeWindow } from 'translime-sdk';
import {
  captureWindowImage,
  findWindowByTitle,
  mountSdlToElectron,
  setupResizeSync,
  setWindowVisible,
} from './win32';
import { getDeviceResolution } from './adb';
import { resolveAdbPath, resolveScrcpyPath } from './bin-resolver';
import { buildScrcpyArgs, nextWindowTitle } from './scrcpy-args';
import computeWindowSize from './window-size';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const PLUGIN_ID = 'translime-plugin-scrcpy-wrapper';
// 冻结帧通知通道（webContents.send，非 ipc.invoke，命名仍带插件 ID 便于区分）
const FREEZE_CHANNEL = `scrcpy-freeze@${PLUGIN_ID}`;
const UNFREEZE_CHANNEL = `scrcpy-unfreeze@${PLUGIN_ID}`;

// 画面窗口底部控制条的 CSS 高度，需与 wrapper-app.vue 的底条高度保持一致
export const BAR_CSS_HEIGHT = 48;
// 画面窗口顶部自绘标题栏的 CSS 高度，需与 wrapper-app.vue 的标题栏及
// titleBarOverlay.height 保持一致；SDL 画面区位于标题栏与底条之间
export const TITLE_BAR_CSS_HEIGHT = 32;

// 开发期 dist 产物变化后 Electron 对 file:// 子资源的缓存不会失效，
// 给本插件 dist 的请求追加时间戳查询参数击穿缓存（file 协议读取忽略查询参数）；
// globalThis 标记防止插件热重载后重复注册监听
const bustWrapperCache = () => {
  if (globalThis.scrcpyWrapperCacheBustRegistered) {
    return;
  }
  globalThis.scrcpyWrapperCacheBustRegistered = true;
  electronSession.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const isWrapperAsset = /^file:\/\/.+scrcpy-wrapper\/dist\/wrapper\.(html|js|css)(\?|$)/.test(details.url);
    if (!isWrapperAsset || details.url.includes('cb=')) {
      callback({});
      return;
    }
    const url = new URL(details.url);
    url.searchParams.set('cb', String(Date.now()));
    callback({ redirectURL: url.href });
  });
};

const sessions = new Map();
// 会话业务键（mirror:<serial> 或 app:<serial>:<pkg>）→ sessionId
const sessionKeys = new Map();

const sessionKey = ({ serial, pkg }) => (pkg ? `app:${serial}:${pkg}` : `mirror:${serial}`);

const getBarPhysicalHeight = (win) => {
  try {
    const display = screen.getDisplayMatching(win.getBounds());
    const scale = display.scaleFactor;
    return {
      bar: BAR_CSS_HEIGHT * scale,
      topBar: TITLE_BAR_CSS_HEIGHT * scale,
    };
  } catch {
    return {
      bar: BAR_CSS_HEIGHT,
      topBar: TITLE_BAR_CSS_HEIGHT,
    };
  }
};

/** 生成未与存活会话或现存顶层窗口冲突的 scrcpy 窗口标题 */
const nextUniqueTitle = () => {
  const used = new Set(Array.from(sessions.values(), (session) => session.title));
  let title = nextWindowTitle();
  while (used.has(title) || findWindowByTitle(title)) {
    title = nextWindowTitle();
  }
  return title;
};

/**
 * 拖动调整窗口尺寸期间冻结画面：抓取拖动开始时刻的 SDL 帧，
 * 隐藏 SDL 子窗口并通知页面显示拉伸 + blur 的冻结帧覆盖层
 * （覆盖层是网页内容，层级在原生子窗口之下，必须先隐藏子窗口）
 */
const startResizeFreeze = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session || session.freezeActive || session.win.isDestroyed()) {
    return;
  }
  const frame = captureWindowImage(session.hwnd);
  if (!frame) {
    return;
  }
  session.freezeActive = true;
  setWindowVisible(session.hwnd, false);
  session.win.webContents.send(FREEZE_CHANNEL, frame);
};

const endResizeFreeze = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session || !session.freezeActive) {
    return;
  }
  session.freezeActive = false;
  if (!session.win.isDestroyed()) {
    session.win.webContents.send(UNFREEZE_CHANNEL);
  }
};

const createWrapperWindow = ({ title, sessionId, contentSize }) => {
  const win = new BrowserWindow({
    // useContentSize 让宽高只描述网页内容区，画面区按设备比例精确铺满
    useContentSize: true,
    width: contentSize.width,
    height: contentSize.height,
    minWidth: 200,
    minHeight: 240,
    resizable: true,
    backgroundColor: '#000000',
    title,
    show: true,
    // 自绘标题栏 + 窗口控制栏覆盖（同宿主主窗口）：页面顶部为可拖动标题栏，
    // 右上角保留系统最小化/最大化/关闭按钮
    ...(process.platform === 'win32'
      ? {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#00000000',
          symbolColor: '#ffffff',
          height: TITLE_BAR_CSS_HEIGHT,
        },
      }
      : {}),
    webPreferences: {
      preload: path.join(dirname, 'wrapper-preload.cjs.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  // 移除默认菜单栏，画面窗口只保留自绘标题栏
  win.removeMenu();
  // F12 / Ctrl+Shift+I 开关 DevTools；SDL 子窗口持有 Win32 焦点时按键
  // 会进入 scrcpy 注入设备，此时先点击自绘标题栏或底条让页面获得焦点
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }
    const isF12 = input.key === 'F12';
    const isCtrlShiftI = input.control && input.shift && input.key.toLowerCase() === 'i';
    if (!isF12 && !isCtrlShiftI) {
      return;
    }
    event.preventDefault();
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
      return;
    }
    // detached：画面区被原生 SDL 子窗口覆盖，停靠模式会被其遮挡
    win.webContents.openDevTools({ mode: 'detach' });
  });
  // 不启用 bootstrap：它会在页面内再装一套默认（跟随系统）主题控制器，覆盖本窗口的固定深色主题
  setupMdeWindow(win, { injectTheme: true, syncTheme: true });
  // 页面 <title> 会覆盖窗口标题，固定保持会话专属标题供任务栏与 FindWindowW 识别
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  win.loadFile(path.join(dirname, 'wrapper.html'), { query: { session: sessionId, title } });
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
  if (session.key && sessionKeys.get(session.key) === sessionId) {
    sessionKeys.delete(session.key);
  }
  if (session.hooks) {
    session.hooks.destroy();
  }
  const { proc } = session;
  if (proc.exitCode === null && !session.spawnError) {
    killProcessTree(proc);
  }
};

/**
 * 启动一个 scrcpy 会话：spawn 进程、创建 wrapper 窗口、等待并挂载 SDL 窗口。
 *
 * 同一设备的镜像会话与同一应用（任意模式）的会话各自只保留一个窗口，
 * 重复启动改为唤起已有窗口
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

  const key = sessionKey({ serial, pkg });
  const existingId = sessionKeys.get(key);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing && !existing.win.isDestroyed()) {
      if (existing.win.isMinimized()) {
        existing.win.restore();
      }
      existing.win.focus();
      return { sessionId: existingId, title: existing.title, reused: true };
    }
  }

  const scrcpyInfo = resolveScrcpyPath({ settingValue });
  const adbPath = resolveAdbPath({ scrcpyResolved: scrcpyInfo.resolved });
  const title = nextUniqueTitle();
  const sessionId = `session-${title}`;

  // 弹出时按设备分辨率与鼠标所在显示器的工作区计算初始窗口尺寸，画面等比铺满
  bustWrapperCache();
  const resolution = await getDeviceResolution(adbPath, serial);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const contentSize = computeWindowSize({
    resolution,
    workArea: {
      width: display.workArea.width,
      height: display.workArea.height - BAR_CSS_HEIGHT - TITLE_BAR_CSS_HEIGHT,
    },
    barCssHeight: BAR_CSS_HEIGHT,
    titleBarCssHeight: TITLE_BAR_CSS_HEIGHT,
  });

  const args = buildScrcpyArgs({
    mode,
    serial,
    pkg,
    title,
    // 虚拟屏以画面区物理分辨率创建并开启 flex-display，分辨率连续跟随窗口
    virtualDisplaySize: mode === 'virtual'
      ? {
        width: Math.max(1, Math.round(contentSize.width * display.scaleFactor)),
        height: Math.max(1, Math.round(
          (contentSize.height - BAR_CSS_HEIGHT - TITLE_BAR_CSS_HEIGHT) * display.scaleFactor,
        )),
      }
      : null,
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
  const win = createWrapperWindow({ title: wrapperTitle, sessionId, contentSize });
  const session = {
    id: sessionId,
    key,
    serial,
    mode,
    pkg,
    title,
    proc,
    win,
    adbPath,
    resolution,
    hooks: null,
    spawnError: null,
  };
  sessions.set(sessionId, session);
  sessionKeys.set(key, sessionId);

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
    session.hwnd = hwnd;
    session.freezeActive = false;
    // 镜像模式按设备分辨率等比缩放（letterbox）；虚拟屏分辨率随窗口，铺满
    const aspect = mode === 'mirror' ? resolution : null;
    const barHeights = getBarPhysicalHeight(win);
    await mountSdlToElectron(win, hwnd, {
      barPhysicalHeight: barHeights.bar,
      topBarPhysicalHeight: barHeights.topBar,
      aspect,
    });
    session.hooks = setupResizeSync(win, hwnd, {
      getBarPhysicalHeight: () => getBarPhysicalHeight(win).bar,
      getTopBarPhysicalHeight: () => getBarPhysicalHeight(win).topBar,
      getAspect: () => (mode === 'mirror' ? session.resolution : null),
      onResizeBurstStart: () => startResizeFreeze(sessionId),
      onResizeSettled: () => endResizeFreeze(sessionId),
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
