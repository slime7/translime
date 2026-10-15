import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  BrowserWindow, clipboard, session as electronSession, screen,
} from 'electron';
import { setupMdeWindow } from 'translime-sdk';
import { MediaStreamParser } from './server/video-frame-parser';
import { buildServerCommand, SERVER_DEVICE_PATH, socketNameForScid } from './server/server-args';
import {
  ControlReplyParser, encodeControlMessage, setClipboard, startApp,
} from './server/control-message';
import {
  getDeviceResolution, pushServer, reverseAdd, reverseRemove,
} from './adb';
import { resolveAdbPath, resolveServerPath } from './bin-resolver';
import computeWindowSize from './window-size';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// 画面窗口底部控制条的 CSS 高度，需与 wrapper-app.vue 的底条高度保持一致
export const BAR_CSS_HEIGHT = 48;
// 预留系统标题栏与非客户区高度，避免窗口弹出时被工作区裁剪破坏画面比例
const TITLE_BAR_CSS_ESTIMATE = 48;
// 主进程 → 画面窗口的媒体/状态推送通道
export const MEDIA_CHANNEL = 'scrcpy-media@translime-plugin-scrcpy-wrapper';
// 等待设备侧 server 建立三条连接的超时
const CONNECT_TIMEOUT_MS = 15000;

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

const createWrapperWindow = ({
  title, sessionId, contentSize, mode,
}) => {
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
    webPreferences: {
      preload: path.join(dirname, 'wrapper-preload.cjs.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  // 移除默认菜单栏
  win.removeMenu();
  // 不启用 bootstrap：它会在页面内再装一套默认（跟随系统）主题控制器，覆盖本窗口的固定深色主题
  setupMdeWindow(win, { injectTheme: true, syncTheme: true });
  // 固定窗口标题供任务栏识别，页面 <title> 不覆盖
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  win.loadFile(path.join(dirname, 'wrapper.html'), { query: { session: sessionId, mode } });
  return win;
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

/** 生成未与存活会话冲突的 31 位非负 scid */
const nextScid = () => {
  const used = new Set(Array.from(sessions.values(), (session) => session.scid));
  let scid = randomInt(0, 0x80000000);
  while (used.has(scid)) {
    scid = randomInt(0, 0x80000000);
  }
  return scid;
};

const sendMedia = (session, payload) => {
  const { win } = session;
  if (win && !win.isDestroyed()) {
    win.webContents.send(MEDIA_CHANNEL, { sessionId: session.id, ...payload });
  }
};

/**
 * 在 socket 上挂媒体解析器并把事件转发到画面窗口。
 *
 * 视频流错误视为致命（画面已不可用）；音频流错误仅通知页面，不中断会话
 */
const attachMediaStream = (session, socket, { video }) => {
  const parser = new MediaStreamParser({ deviceMeta: video, video });
  socket.on('data', (chunk) => {
    parser.push(chunk).forEach((event) => {
      if (event.kind === 'codec') {
        session.logger?.info(`[scrcpy:${session.id}] ${video ? 'video' : 'audio'} codec: ${event.codec}`);
      } else if (event.kind === 'device-meta') {
        session.logger?.info(`[scrcpy:${session.id}] device: ${event.deviceName}`);
      } else if (event.kind === 'session') {
        sendMedia(session, {
          kind: 'session', media: video ? 'video' : 'audio', width: event.width, height: event.height, clientResized: event.clientResized,
        });
      } else if (event.kind === 'frame') {
        sendMedia(session, {
          kind: video ? 'video' : 'audio', pts: event.pts, keyframe: event.keyframe, data: event.data,
        });
      } else if (event.kind === 'error') {
        if (video) {
          session.fail(event.message);
        } else {
          sendMedia(session, { kind: 'error', scope: 'audio', message: event.message });
        }
      }
    });
  });
};

/**
 * 等待设备侧 server 按序接入：video → audio → control
 */
const waitForConnections = (tcpServer, expected, options = {}) => {
  const { timeoutMs = CONNECT_TIMEOUT_MS, shouldAbort } = options;
  return new Promise((resolve, reject) => {
    const sockets = [];
    let settled = false;
    const startedAt = Date.now();
    let timer = null;

    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      tcpServer.removeAllListeners('connection');
      if (error) {
        sockets.forEach((socket) => socket.destroy());
        reject(error);
        return;
      }
      resolve(sockets);
    };

    const onConnection = (socket) => {
      if (settled) {
        socket.destroy();
        return;
      }
      sockets.push(socket);
      if (sockets.length >= expected) {
        finish(null);
      }
    };

    timer = setInterval(() => {
      if (shouldAbort?.()) {
        finish(new Error('scrcpy server 已退出，未能建立连接'));
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        finish(new Error(`等待设备画面连接超时（${timeoutMs}ms）`));
      }
    }, 100);
    tcpServer.on('connection', onConnection);
    tcpServer.on('error', (e) => finish(e));
  });
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
  session.destroyed = true;
  try {
    session.videoSocket?.destroy();
    session.audioSocket?.destroy();
    session.controlSocket?.destroy();
  } catch {
    // socket 可能已销毁
  }
  try {
    session.tcpServer?.close();
    session.tcpServer?.closeAllConnections?.();
  } catch {
    // server 可能已关闭
  }
  const { proc } = session;
  if (proc?.exitCode === null && !session.spawnError) {
    killProcessTree(proc);
  }
  // 释放 reverse 隧道；规则可能已被 adb 侧回收，失败静默
  if (session.adbPath && session.serial && session.socketName) {
    reverseRemove(session.adbPath, session.serial, session.socketName);
  }
};

/**
 * 向会话画面注入一条控制消息（触摸/滚轮/按键/剪贴板等）
 *
 * @param {string} sessionId
 * @param {object} message - 结构化输入消息，见 encodeControlMessage；
 *   额外支持 `{ type: 'paste-clipboard' }`：PC 剪贴板内容写入设备并触发粘贴。
 * @returns {boolean} 是否成功写入。
 */
export const sendInput = (sessionId, message) => {
  const session = sessions.get(sessionId);
  if (!session || session.destroyed || !session.controlSocket) {
    return false;
  }
  if (message?.type === 'paste-clipboard') {
    const text = clipboard.readText();
    session.lastClipboardSet = text;
    session.controlSocket.write(setClipboard({ text, paste: true }));
    return true;
  }
  session.controlSocket.write(encodeControlMessage(message));
  return true;
};

/**
 * 启动一个投屏会话：建立 reverse 隧道、推送并启动设备侧 scrcpy-server、
 * 接收媒体流转发到画面窗口。
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
    adbSettingValue = null,
    serverSettingValue = null,
    videoCodec = 'h264',
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

  const adbPath = resolveAdbPath({ settingValue: adbSettingValue, legacyScrcpySettingValue: settingValue });
  const serverPath = resolveServerPath({ settingValue: serverSettingValue });
  if (!serverPath) {
    throw new Error('未找到 scrcpy-server，请检查插件安装完整性或设置项');
  }

  bustWrapperCache();
  const resolution = await getDeviceResolution(adbPath, serial);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const contentSize = computeWindowSize({
    resolution,
    workArea: {
      width: display.workArea.width,
      height: display.workArea.height - BAR_CSS_HEIGHT - TITLE_BAR_CSS_ESTIMATE,
    },
    barCssHeight: BAR_CSS_HEIGHT,
  });

  const scid = nextScid();
  const socketName = socketNameForScid(scid);
  const sessionId = `session-${socketName}`;
  const wrapperTitle = pkg ? `${pkg} - ${serial}` : `${serial} 画面`;
  // 虚拟屏以画面区物理分辨率创建并开启 flex-display，分辨率连续跟随窗口
  const virtualDisplaySize = mode === 'virtual'
    ? {
      width: Math.max(1, Math.round(contentSize.width * display.scaleFactor)),
      height: Math.max(1, Math.round((contentSize.height - BAR_CSS_HEIGHT) * display.scaleFactor)),
    }
    : null;
  const serverCommand = buildServerCommand({
    scid,
    videoCodec,
    audio: true,
    newDisplay: virtualDisplaySize ? `${virtualDisplaySize.width}x${virtualDisplaySize.height}` : null,
    flexDisplay: virtualDisplaySize !== null,
  });

  const tcpServer = net.createServer();
  await new Promise((resolve, reject) => {
    tcpServer.once('error', reject);
    tcpServer.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const listenPort = tcpServer.address().port;

  const session = {
    id: sessionId,
    key,
    serial,
    mode,
    pkg,
    scid,
    socketName,
    adbPath,
    serverPath,
    resolution: virtualDisplaySize ?? resolution,
    logger,
    tcpServer,
    listenPort,
    videoSocket: null,
    audioSocket: null,
    controlSocket: null,
    proc: null,
    spawnError: null,
    stderrTail: [],
    lastClipboardSet: null,
    destroyed: false,
    win: null,
    fail: null,
  };
  sessions.set(sessionId, session);
  sessionKeys.set(key, sessionId);

  let winClosed = false;
  const cleanupAndRethrow = async (e) => {
    if (!winClosed && session.win && !session.win.isDestroyed()) {
      session.win.destroy();
    }
    destroySession(sessionId);
    throw e;
  };

  try {
    await reverseAdd(adbPath, serial, socketName, listenPort);
    await pushServer(adbPath, serial, serverPath, SERVER_DEVICE_PATH);

    // 常驻 adb shell 进程作为设备侧 server 的生命周期锚点：
    // 进程退出即代表 server 结束，socket 关闭（EOF）也会让 server 自行退出
    const proc = spawn(adbPath, ['-s', serial, ...serverCommand], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    session.proc = proc;
    proc.on('error', (e) => {
      session.spawnError = e;
    });
    proc.stdout?.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) {
        logger.info(`[scrcpy:${sessionId}] ${text}`);
      }
    });
    proc.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (!text) {
        return;
      }
      logger.info(`[scrcpy:${sessionId}] ${text}`);
      session.stderrTail.push(text);
      if (session.stderrTail.length > 20) {
        session.stderrTail.shift();
      }
    });
    proc.on('exit', (code) => {
      logger.info(`[scrcpy:${sessionId}] server process exited (code=${code})`);
      if (!session.destroyed && session.win && !session.win.isDestroyed()) {
        // 设备侧 server 意外结束：直接关窗（用户已可见的失败反馈）
        session.win.destroy();
      }
      destroySession(sessionId);
    });

    session.win = createWrapperWindow({
      title: wrapperTitle, sessionId, contentSize, mode,
    });
    session.win.on('closed', () => {
      winClosed = true;
      destroySession(sessionId);
    });

    const connections = await waitForConnections(tcpServer, 3, {
      shouldAbort: () => session.destroyed || proc.exitCode !== null || session.spawnError !== null,
    });
    const [videoSocket, audioSocket, controlSocket] = connections;
    session.videoSocket = videoSocket;
    session.audioSocket = audioSocket;
    session.controlSocket = controlSocket;
    // 控制通道消息小而频繁，禁用 Nagle 降低输入延迟
    controlSocket.setNoDelay(true);

    // 控制通道回包（设备剪贴板自动同步）：写回 PC 剪贴板；
    // 与自身粘贴的内容相同则跳过，避免回环覆盖
    const replyParser = new ControlReplyParser();
    controlSocket.on('data', (chunk) => {
      replyParser.push(chunk).forEach((reply) => {
        if (reply.type === 'clipboard' && reply.text && reply.text !== session.lastClipboardSet) {
          clipboard.writeText(reply.text);
        }
      });
    });

    videoSocket.on('close', () => {
      if (!session.destroyed) {
        session.fail('视频连接已断开');
      }
    });
    audioSocket.on('close', () => {
      if (!session.destroyed) {
        sendMedia(session, { kind: 'error', scope: 'audio', message: '音频连接已断开' });
      }
    });
    attachMediaStream(session, videoSocket, { video: true });
    attachMediaStream(session, audioSocket, { video: false });

    session.fail = (message) => {
      logger.error(`[scrcpy:${sessionId}] ${message}`);
      sendMedia(session, { kind: 'error', scope: 'video', message });
      if (session.win && !session.win.isDestroyed()) {
        session.win.destroy();
      }
      destroySession(sessionId);
    };

    if (pkg) {
      // scrcpy 以 LAUNCHER intent 拉起应用：已在后台运行的任务会被带到前台
      controlSocket.write(startApp(pkg));
    }
    return { sessionId, title: wrapperTitle };
  } catch (e) {
    const detail = session.stderrTail.length > 0
      ? `：${session.stderrTail.slice(-3).join(' / ')}`
      : '';
    if (session.spawnError) {
      return cleanupAndRethrow(new Error(`无法启动 adb（${adbPath}）：${session.spawnError.message}`));
    }
    return cleanupAndRethrow(e instanceof Error ? new Error(`${e.message}${detail}`) : new Error(String(e)));
  }
};

export const getSession = (sessionId) => sessions.get(sessionId) ?? null;

export const closeSession = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }
  if (session.win && !session.win.isDestroyed()) {
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
