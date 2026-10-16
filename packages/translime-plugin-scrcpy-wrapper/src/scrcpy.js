import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BrowserWindow,
  session as electronSession,
  ipcMain,
  nativeTheme,
  screen,
} from 'electron';
import { setupMdeWindow } from 'translime-sdk';
import {
  captureWindowPixels,
  ensureChildOnTop,
  findWindowByTitle,
  getCursorPosInClient,
  isWrapperWindowActive,
  lowerWindowBelowSiblings,
  mountSdlToElectron,
  setupResizeSync,
  windowPixelsToDataUrl,
} from './win32';
import createCatchUpMonitor from './catch-up-monitor';
import {
  getDefaultLauncherPackage,
  getDeviceResolution,
  getForegroundApp,
  launchApp,
} from './adb';
import { resolveAdbPath, resolveScrcpyPath } from './bin-resolver';
import { buildScrcpyArgs, nextWindowTitle, parseVideoSize } from './scrcpy-args';
import {
  calculateAspectCorrection,
  calculateProportionalSize,
  computeWindowSize,
  restoreMirrorContentSize,
} from './window-size';
import { isChromeRevealed } from './chrome-reveal';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const PLUGIN_ID = 'translime-plugin-scrcpy-wrapper';
// 冻结帧通知通道（webContents.send，非 ipc.invoke，命名仍带插件 ID 便于区分）
const FREEZE_CHANNEL = `scrcpy-freeze@${PLUGIN_ID}`;
const UNFREEZE_CHANNEL = `scrcpy-unfreeze@${PLUGIN_ID}`;
const CHROME_VISIBLE_CHANNEL = `scrcpy-chrome-visible@${PLUGIN_ID}`;
const FOREGROUND_APP_CHANNEL = `scrcpy-foreground-app@${PLUGIN_ID}`;
const SDL_RECT_CHANNEL = `scrcpy-sdl-rect@${PLUGIN_ID}`;
const WINDOW_CONTROL_CHANNEL = `scrcpy-window-control@${PLUGIN_ID}`;

// 画面窗口顶部自绘标题栏 CSS 高度
export const TITLE_BAR_CSS_HEIGHT = 32;
// 虚拟屏无底部控制条
export const BAR_CSS_HEIGHT = 0;
// 画面窗口右侧垂直工具栏 CSS 宽度（mat-toolbar 浮动宽度为 88px）
export const TOOLBAR_CSS_WIDTH = 88;
// SDL 画面区周围 outline 边框 CSS 宽度
export const SDL_BORDER_CSS = 8;
// SDL 画面区内圆角 CSS 半径（20px，与 28px 外圆角扣除 8px 边框后的内圆角一致）
export const SDL_CORNER_RADIUS_CSS = 20;
// 画面区四周统一留白（标题栏悬浮在顶部留白内，使四周边缘留白大致相等）
export const OUTER_GAP_CSS = 48;
export const TOOLBAR_GAP_CSS = 24;

// 原生标题栏按钮随宿主主题明暗切换的前景色
const OVERLAY_SYMBOL_COLORS = {
  dark: '#ffffff',
  light: '#1f1f1f',
};

export const getChromeMetrics = (mode = 'mirror') => {
  if (mode === 'virtual') {
    return {
      leftOffset: 0,
      rightOffset: 0,
      topOffset: TITLE_BAR_CSS_HEIGHT,
      bottomOffset: 0,
      chromeWidth: 0,
      chromeHeight: TITLE_BAR_CSS_HEIGHT,
    };
  }
  const leftOffset = OUTER_GAP_CSS + SDL_BORDER_CSS;
  const rightOffset = SDL_BORDER_CSS + TOOLBAR_GAP_CSS + TOOLBAR_CSS_WIDTH + OUTER_GAP_CSS;
  const topOffset = OUTER_GAP_CSS + SDL_BORDER_CSS;
  const bottomOffset = OUTER_GAP_CSS + SDL_BORDER_CSS;
  return {
    leftOffset,
    rightOffset,
    topOffset,
    bottomOffset,
    chromeWidth: leftOffset + rightOffset,
    chromeHeight: topOffset + bottomOffset,
  };
};

const registerWindowControlHandler = () => {
  if (globalThis.scrcpyWindowControlRegistered) {
    return;
  }
  globalThis.scrcpyWindowControlRegistered = true;
  ipcMain.on(WINDOW_CONTROL_CHANNEL, (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return;
    }
    if (action === 'minimize') {
      win.minimize();
    } else if (action === 'close') {
      win.close();
    }
  });
};

const applyOverlaySymbolColor = (win) => {
  if (process.platform !== 'win32' || typeof win.setTitleBarOverlay !== 'function') {
    return;
  }
  try {
    win.setTitleBarOverlay({
      color: '#00000000',
      symbolColor: nativeTheme.shouldUseDarkColors
        ? OVERLAY_SYMBOL_COLORS.dark
        : OVERLAY_SYMBOL_COLORS.light,
    });
  } catch {
    // 窗口可能已销毁或无标题栏 overlay
  }
};

// 为本插件 dist 的 file 协议资源请求追加时间戳参数以绕过 Electron 本地缓存
const bustWrapperCache = () => {
  if (globalThis.scrcpyWrapperCacheBustRegistered) {
    return;
  }
  globalThis.scrcpyWrapperCacheBustRegistered = true;
  electronSession.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const isWrapperAsset = /^file:\/\/.+scrcpy-wrapper\/dist\/(mirror|virtual|wrapper)\.(html|js|css)(\?|$)/.test(details.url);
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
// 会话业务键（mirror:<serial> 或 virtual:<serial>:<pkg>）→ sessionId
const sessionKeys = new Map();

// 虚拟屏窗口的原生标题栏按钮跟随宿主主题明暗切换
const registerOverlayThemeSync = () => {
  if (globalThis.scrcpyOverlayThemeSyncRegistered) {
    return;
  }
  globalThis.scrcpyOverlayThemeSyncRegistered = true;
  nativeTheme.on('updated', () => {
    sessions.forEach((session) => {
      if (session.mode !== 'virtual' || !session.win || session.win.isDestroyed()) {
        return;
      }
      applyOverlaySymbolColor(session.win);
    });
  });
};

export const sessionKey = ({ serial, mode = 'mirror', pkg = null }) => (
  mode === 'virtual' ? `virtual:${serial}:${pkg ?? 'app'}` : `mirror:${serial}`
);

export const getSessionIdByKey = (key) => sessionKeys.get(key) ?? null;

const getPhysicalDims = (win, mode = 'mirror') => {
  let scale = 1;
  try {
    const display = screen.getDisplayMatching(win.getBounds());
    scale = display.scaleFactor;
  } catch {
    scale = 1;
  }
  const m = getChromeMetrics(mode);
  return {
    scale,
    topBar: Math.round(TITLE_BAR_CSS_HEIGHT * scale),
    toolbar: Math.round(TOOLBAR_CSS_WIDTH * scale),
    border: Math.round(SDL_BORDER_CSS * scale),
    gap: Math.round(OUTER_GAP_CSS * scale),
    leftOffset: Math.round(m.leftOffset * scale),
    topOffset: Math.round(m.topOffset * scale),
    rightOffset: Math.round(m.rightOffset * scale),
    bottomOffset: Math.round(m.bottomOffset * scale),
  };
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

const cancelCatchUp = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  session.catchUp?.cancel();
  session.catchUp = null;
};

/**
 * 撤下缩放冻结覆盖层并将 SDL 窗口置顶。
 */
const revealFreeze = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session || !session.freezeActive) {
    return;
  }
  session.freezeActive = false;
  session.catchUp = null;
  if (session.win.isDestroyed()) {
    return;
  }
  // 等渲染层 150ms 淡出完成后再抬升 SDL，避免模糊层被立即盖住产生闪变
  [180, 400, 700, 1000].forEach((delayMs) => {
    setTimeout(() => {
      if (session.freezeActive || !session.hwnd || session.win.isDestroyed()) {
        return;
      }
      try {
        ensureChildOnTop(session.win, session.hwnd);
      } catch {
        // 窗口可能已销毁
      }
    }, delayMs);
  });
  session.win.webContents.send(UNFREEZE_CHANNEL);
};

const checkAndFixProportionalSize = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session || !session.win || session.win.isDestroyed() || !session.resolution || session.mode !== 'mirror') {
    return;
  }
  const [w, h] = session.win.getContentSize();
  const { chromeWidth, chromeHeight } = getChromeMetrics('mirror');
  // 容差 1px：仅修正在拖拽或 DPI 取整中累积出的可见偏差，
  // 避免与 resize 事件互相触发形成抖动
  const adjusted = calculateAspectCorrection({
    width: w,
    height: h,
    ratio: session.resolution.width / session.resolution.height,
    chromeWidth,
    chromeHeight,
  });
  if (adjusted) {
    session.resizingProgrammatically = true;
    try {
      session.win.setContentSize(adjusted.width, adjusted.height);
    } finally {
      session.resizingProgrammatically = false;
    }
  }
};

/**
 * 窗口调整结束后的状态收尾与冻结层撤下。
 */
const settleResize = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  if (session.mode === 'mirror' && session.win && !session.win.isDestroyed()) {
    // 先修正回设备比例再保存，避免把偏差窗口尺寸带入下次启动恢复
    checkAndFixProportionalSize(sessionId);
    const [w, h] = session.win.getContentSize();
    session.onSaveMirrorSize?.({ width: w, height: h });
  }
  if (!session.freezeActive) {
    return;
  }
  if (session.mode !== 'virtual') {
    revealFreeze(sessionId);
    return;
  }
  session.catchUp = createCatchUpMonitor({
    mode: session.captureReliable ? 'diff' : 'timed',
    capture: () => captureWindowPixels(session.hwnd),
    reveal: () => revealFreeze(sessionId),
  });
  session.catchUp.start();
};

/**
 * 调整尺寸开始时抓取当前帧作为过渡背景并下推 SDL。
 */
const startResizeFreeze = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session || !session.hwnd || session.win.isDestroyed()) {
    return;
  }
  const before = captureWindowPixels(session.hwnd);
  if (!before) {
    return;
  }
  cancelCatchUp(sessionId);
  session.freezeActive = true;
  lowerWindowBelowSiblings(session.hwnd);
  const after = captureWindowPixels(session.hwnd);
  session.captureReliable = Boolean(after && after.buffer.equals(before.buffer));
  session.win.webContents.send(FREEZE_CHANNEL, windowPixelsToDataUrl(before));
};

const createWrapperWindow = ({
  title, sessionId, contentSize, mode = 'mirror',
}) => {
  registerWindowControlHandler();
  registerOverlayThemeSync();
  const isMirror = mode === 'mirror';
  const win = new BrowserWindow({
    // useContentSize 让宽高只描述网页内容区，画面区按设备比例精确铺满
    useContentSize: true,
    width: contentSize.width,
    height: contentSize.height,
    minWidth: 200,
    minHeight: 240,
    resizable: true,
    frame: false,
    transparent: isMirror,
    shadow: !isMirror,
    backgroundColor: isMirror ? '#00000000' : '#000000',
    title,
    show: true,
    maximizable: !isMirror,
    ...(!isMirror && process.platform === 'win32'
      ? {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#00000000',
          symbolColor: nativeTheme.shouldUseDarkColors
            ? OVERLAY_SYMBOL_COLORS.dark
            : OVERLAY_SYMBOL_COLORS.light,
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
    win.webContents.openDevTools({ mode: 'detach' });
  });
  setupMdeWindow(win, { injectTheme: true, syncTheme: true });
  // 保持会话标题供任务栏与 FindWindowW 识别
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  const htmlFile = isMirror ? 'mirror.html' : 'virtual.html';
  win.loadFile(path.join(dirname, htmlFile), { query: { session: sessionId, title } });
  return win;
};

const waitForScrcpyWindow = (title, options = {}) => {
  const { intervalMs = 100, timeoutMs = 15000, shouldAbort } = options;
  return new Promise((resolve, reject) => {
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
  if (session.cursorTimer) {
    clearInterval(session.cursorTimer);
    session.cursorTimer = null;
  }
  cancelCatchUp(sessionId);
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
 * 启动 scrcpy 会话并挂载画面至 wrapper 窗口。
 */
export const launchSession = async (options = {}) => {
  const {
    mode = 'mirror',
    serial,
    pkg = null,
    resolution: passedResolution = null,
    savedSize = null,
    inheritedContentSize = null,
    onSaveMirrorSize = null,
    settingValue = null,
    logger = console,
  } = options;
  if (!serial) {
    throw new Error('缺少设备 serial');
  }

  const scrcpyInfo = resolveScrcpyPath({ settingValue });
  const adbPath = resolveAdbPath({ scrcpyResolved: scrcpyInfo.resolved });
  const key = sessionKey({ serial, mode, pkg });
  const existingId = sessionKeys.get(key);
  if (existingId) {
    const existing = sessions.get(existingId);
    if (existing && !existing.win.isDestroyed()) {
      if (existing.win.isMinimized()) {
        existing.win.restore();
      }
      existing.win.focus();
      if (mode === 'mirror' && pkg) {
        await launchApp(adbPath, serial, pkg).catch((e) => {
          logger.warn(`[scrcpy] 启动应用失败: ${e.message}`);
        });
      }
      return { sessionId: existingId, title: existing.title, reused: true };
    }
  }

  if (mode === 'mirror' && pkg) {
    await launchApp(adbPath, serial, pkg).catch((e) => {
      logger.warn(`[scrcpy] 启动应用失败: ${e.message}`);
    });
  }

  const title = nextUniqueTitle();
  const sessionId = `session-${title}`;

  bustWrapperCache();
  const resolution = (passedResolution && passedResolution.width > 0 && passedResolution.height > 0)
    ? passedResolution
    : await getDeviceResolution(adbPath, serial);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { chromeWidth, chromeHeight } = getChromeMetrics(mode);

  let contentSize;
  if (mode === 'virtual' && inheritedContentSize && inheritedContentSize.width > 0 && inheritedContentSize.height > 0) {
    contentSize = {
      width: Math.min(inheritedContentSize.width, display.workArea.width - 32),
      height: Math.min(inheritedContentSize.height, display.workArea.height - 32),
    };
  } else if (mode === 'mirror' && savedSize && savedSize.width > 0 && savedSize.height > 0) {
    contentSize = restoreMirrorContentSize({
      savedSize,
      ratio: resolution && resolution.width > 0 && resolution.height > 0
        ? resolution.width / resolution.height
        : null,
      chromeWidth,
      chromeHeight,
      maxWidth: display.workArea.width - 64,
      maxHeight: display.workArea.height - 64,
    });
  } else {
    contentSize = computeWindowSize({
      resolution,
      workArea: {
        width: display.workArea.width,
        height: display.workArea.height,
      },
      toolbarCssWidth: mode === 'mirror' ? TOOLBAR_CSS_WIDTH : 0,
      toolbarGapCss: mode === 'mirror' ? TOOLBAR_GAP_CSS : 24,
      titleBarCssHeight: TITLE_BAR_CSS_HEIGHT,
      borderCss: mode === 'mirror' ? SDL_BORDER_CSS : 0,
      gapCss: mode === 'mirror' ? OUTER_GAP_CSS : 0,
      barCssHeight: mode === 'virtual' ? BAR_CSS_HEIGHT : 0,
    });
  }

  const args = buildScrcpyArgs({
    mode,
    serial,
    pkg,
    title,
    virtualDisplaySize: mode === 'virtual'
      ? {
        width: Math.max(1, Math.round(
          (contentSize.width - chromeWidth) * display.scaleFactor,
        )),
        height: Math.max(1, Math.round(
          (contentSize.height - chromeHeight) * display.scaleFactor,
        )),
      }
      : null,
  });
  const wrapperTitle = pkg ? `${pkg} - ${serial}` : `${serial} 画面`;

  const env = { ...process.env };
  if (scrcpyInfo.resolved && adbPath !== 'adb') {
    env.ADB = adbPath;
  }

  const proc = spawn(scrcpyInfo.command, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  const win = createWrapperWindow({
    title: wrapperTitle, sessionId, contentSize, mode,
  });
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
    defaultLauncher: null,
    onSaveMirrorSize,
    hooks: null,
    freezeActive: false,
    captureReliable: false,
    catchUp: null,
    spawnError: null,
    cursorTimer: null,
    resizingProgrammatically: false,
  };
  sessions.set(sessionId, session);
  sessionKeys.set(key, sessionId);

  if (mode === 'mirror') {
    getDefaultLauncherPackage(adbPath, serial).then((launcherPkg) => {
      session.defaultLauncher = launcherPkg;
      getForegroundApp(adbPath, serial, { defaultLauncher: launcherPkg }).then((appPkg) => {
        if (!win.isDestroyed()) {
          win.webContents.send(FOREGROUND_APP_CHANNEL, {
            hasApp: Boolean(appPkg),
            pkg: appPkg,
          });
        }
      }).catch(() => {});
    }).catch(() => {});

    // 镜像缩放期间按 SDL 画面比例锁定窗口比例
    win.on('will-resize', (event, newBounds, details) => {
      if (session.resizingProgrammatically) {
        return;
      }
      const ratio = session.resolution && session.resolution.width > 0 && session.resolution.height > 0
        ? session.resolution.width / session.resolution.height
        : null;
      if (!ratio) {
        return;
      }
      const [currentWidth, currentHeight] = win.getContentSize();
      const adjusted = calculateProportionalSize({
        targetWidth: newBounds.width,
        targetHeight: newBounds.height,
        currentWidth,
        currentHeight,
        ratio,
        chromeWidth,
        chromeHeight,
        edge: details?.edge,
      });
      if (adjusted.width !== newBounds.width || adjusted.height !== newBounds.height) {
        event.preventDefault();
        // 拖动左/上边缘时锚定右/下边缘：只 setContentSize 会把窗口左上角钉死，
        // 左上边缘拖不动并回弹
        const edge = details?.edge ?? '';
        const bounds = {
          x: edge.includes('left')
            ? newBounds.x + (newBounds.width - adjusted.width)
            : newBounds.x,
          y: edge.includes('top')
            ? newBounds.y + (newBounds.height - adjusted.height)
            : newBounds.y,
          width: adjusted.width,
          height: adjusted.height,
        };
        session.resizingProgrammatically = true;
        try {
          win.setBounds(bounds);
        } finally {
          session.resizingProgrammatically = false;
        }
      }
    });

    // 监听鼠标位置控制标题栏与工具栏显隐
    let chromeRevealed = true;
    const initialGraceEnd = Date.now() + 4000;
    session.cursorTimer = setInterval(() => {
      if (win.isDestroyed()) {
        if (session.cursorTimer) {
          clearInterval(session.cursorTimer);
          session.cursorTimer = null;
        }
        return;
      }
      // 窗口不在前台（其他应用持焦、被遮挡或最小化）时不触发面板显示；
      // 点击画面后焦点在 SDL 子窗口上，须按前台根窗口判定而非 win.isFocused()
      if (!isWrapperWindowActive(win)) {
        if (chromeRevealed) {
          chromeRevealed = false;
          win.webContents.send(CHROME_VISIBLE_CHANNEL, false);
        }
        return;
      }
      const now = Date.now();
      if (now < initialGraceEnd) {
        if (!chromeRevealed) {
          chromeRevealed = true;
          win.webContents.send(CHROME_VISIBLE_CHANNEL, true);
        }
        return;
      }
      const pt = getCursorPosInClient(win);
      if (!pt) {
        if (chromeRevealed) {
          chromeRevealed = false;
          win.webContents.send(CHROME_VISIBLE_CHANNEL, false);
        }
        return;
      }
      const [w, h] = win.getContentSize();
      const dims = getPhysicalDims(win, mode);
      const cssX = pt.x / dims.scale;
      const cssY = pt.y / dims.scale;
      const nextRevealed = isChromeRevealed({
        x: cssX,
        y: cssY,
        width: w,
        height: h,
        topThreshold: OUTER_GAP_CSS + 24,
        rightThreshold: TOOLBAR_CSS_WIDTH + TOOLBAR_GAP_CSS + 24,
      });
      if (nextRevealed !== chromeRevealed) {
        chromeRevealed = nextRevealed;
        win.webContents.send(CHROME_VISIBLE_CHANNEL, nextRevealed);
      }
      if (nextRevealed) {
        getForegroundApp(adbPath, serial, { defaultLauncher: session.defaultLauncher }).then((appPkg) => {
          if (!win.isDestroyed()) {
            win.webContents.send(FOREGROUND_APP_CHANNEL, {
              hasApp: Boolean(appPkg),
              pkg: appPkg,
            });
          }
        }).catch(() => {});
      }
    }, 180);
  }

  let winClosed = false;
  win.on('closed', () => {
    winClosed = true;
    destroySession(sessionId);
  });
  // scrcpy 输出按行缓冲解析视频纹理尺寸：初始占位窗口比例不可信，
  // 以解码器输出的真实视频尺寸为准修正窗口比例（设备旋转后尺寸变化会再次输出）
  let logBuffer = '';
  const watchVideoSize = (chunk) => {
    logBuffer += String(chunk);
    const lines = logBuffer.split(/\r?\n/);
    logBuffer = lines.pop() ?? '';
    lines.forEach((line) => {
      const videoSize = parseVideoSize(line);
      if (!videoSize || mode !== 'mirror') {
        return;
      }
      const { width, height } = videoSize;
      if (win.isDestroyed()) {
        return;
      }
      if (session.resolution && session.resolution.width === width && session.resolution.height === height) {
        return;
      }
      session.resolution = { width, height };
      checkAndFixProportionalSize(sessionId);
      session.hooks?.syncNow();
    });
  };
  const forwardLog = (chunk) => {
    watchVideoSize(chunk);
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
    // 挂载时可能已从 scrcpy 输出解析到真实视频尺寸，读取会话上的最新值
    const aspect = mode === 'mirror' ? session.resolution : null;
    const dims = getPhysicalDims(win, mode);
    const sendRect = (rect) => {
      if (!win.isDestroyed()) {
        win.webContents.send(SDL_RECT_CHANNEL, rect);
      }
    };
    await mountSdlToElectron(win, hwnd, {
      leftOffsetPhysical: dims.leftOffset,
      topOffsetPhysical: dims.topOffset,
      rightOffsetPhysical: dims.rightOffset,
      bottomOffsetPhysical: dims.bottomOffset,
      borderPhysical: dims.border,
      cornerRadiusCss: mode === 'mirror' ? SDL_CORNER_RADIUS_CSS : 0,
      scaleFactor: dims.scale,
      aspect,
      onRect: sendRect,
    });
    session.hooks = setupResizeSync(win, hwnd, {
      getLeftOffsetPhysical: () => getPhysicalDims(win, mode).leftOffset,
      getTopOffsetPhysical: () => getPhysicalDims(win, mode).topOffset,
      getRightOffsetPhysical: () => getPhysicalDims(win, mode).rightOffset,
      getBottomOffsetPhysical: () => getPhysicalDims(win, mode).bottomOffset,
      getBorderPhysical: () => getPhysicalDims(win, mode).border,
      getCornerRadiusCss: () => (mode === 'mirror' ? SDL_CORNER_RADIUS_CSS : 0),
      getScaleFactor: () => getPhysicalDims(win, mode).scale,
      getAspect: () => (mode === 'mirror' ? session.resolution : null),
      isFrozen: () => session.freezeActive,
      onResizeBurstStart: () => startResizeFreeze(sessionId),
      onResizeSettled: () => settleResize(sessionId),
      onRect: sendRect,
    });
    if (mode === 'mirror') {
      checkAndFixProportionalSize(sessionId);
      session.hooks.syncNow();
    }
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
