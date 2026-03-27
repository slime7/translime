import {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EventEmitter from 'node:events';
import { useLogger, usePluginConfig } from 'translime-sdk';
import * as capture from './capture';

const dirname = typeof __dirname === 'string'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const PLUGIN_ID = 'translime-plugin-hdr-capture';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Main' }) : baseLogger;

/**
 * 内部事件总线，用于跨插件通信
 */
const bus = new EventEmitter();

/**
 * 配置代理实例
 */
const pluginConfig = usePluginConfig(PLUGIN_ID);

// 叠加层窗口实例
let overlayWindow = null;

// 当前注册的快捷键
let registeredShortcut = null;

// 缓存当前截图会话的原始数据 (Raw Buffers + Metadata)
// 用于 save 和 copy 时直接裁剪，不需要重新捕获屏幕
let currentCaptureSession = null;

/**
 * 获取插件设置
 * 按照 SDK 规范，通过 config.get 获取单个配置项
 */
const getShortcut = () => pluginConfig.get('shortcut', '');
const getSavePath = () => pluginConfig.get('savePath') || app.getPath('pictures');
const getSaveFormat = () => pluginConfig.get('saveFormat', 'png');
const getPreserveHdr = () => pluginConfig.get('preserveHdr', false);
// HDR 映射设置
const getEnableHdrMapping = () => pluginConfig.get('enableHdrMapping', true);
const getSdrWhiteNits = () => pluginConfig.get('sdrWhiteNits', 203);
const getHdrMaxNits = () => pluginConfig.get('hdrMaxNits', 1000);
const getCaptureCursor = () => pluginConfig.get('captureCursor', false);

/**
 * 获取所有显示器的组合边界
 */
const getAllDisplaysBounds = () => {
  const displays = screen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  displays.forEach((display) => {
    const {
      x,
      y,
      width,
      height,
    } = display.bounds;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  return {
    displays,
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const getSaveFilenameTemplate = () => pluginConfig.get('saveFilenameTemplate', '');
const getFastResponse = () => pluginConfig.get('fastResponse', true);
const shortcutModifiers = new Set([
  'ctrl',
  'control',
  'alt',
  'shift',
  'super',
  'meta',
  'cmd',
  'command',
]);

const normalizeShortcut = (accelerator = '') => accelerator
  .split('+')
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => (part === 'Win' ? 'Super' : part))
  .join('+');

const isIncompleteShortcut = (accelerator = '') => {
  const parts = accelerator.split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) {
    return true;
  }
  const lastPart = parts[parts.length - 1].toLowerCase();
  return shortcutModifiers.has(lastPart);
};

/**
 * 更新 Overlay 窗口的边界（用于响应屏幕变化）
 */
const updateOverlayBounds = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const {
    minX, minY, maxY, width, height,
  } = getAllDisplaysBounds();

  // 简单策略：如果窗口当前是可见的，我们只需判断它是否应该处于离屏状态
  // 但为了简化逻辑，我们只处理“如果它正在显示内容，则更新其大小以适应新屏幕”
  // 至于离屏状态的窗口，我们干脆再次将其移动到新的安全离屏位置
  // 或者，如果窗口处于离屏位置（y > maxY），我们更新它的离屏位置

  const { y } = overlayWindow.getBounds();

  if (y >= maxY) {
    // 当前处于离屏状态，更新到新的离屏位置
    overlayWindow.setBounds({
      width, height, x: 0, y: maxY + 100,
    });
    logger.info(`屏幕变动，更新离屏位置: (0, ${maxY + 100})`);
  } else {
    // 当前处于显示状态，更新全屏边界
    overlayWindow.setBounds({
      x: minX, y: minY, width, height,
    });
    logger.info(`屏幕变动，更新捕获边界: ${width}x${height} at (${minX}, ${minY})`);
  }
};

/**
 * 注销全局快捷键
 */
const unregisterShortcut = (reason = 'unknown') => {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    logger.info('[shortcut] 快捷键已注销', {
      data: {
        reason,
        accelerator: registeredShortcut,
      },
    });
    registeredShortcut = null;
  }
};

const createOverlayWindow = (isDebug = false, offscreen = false) => {
  const {
    minX, minY, maxY, width, height,
  } = getAllDisplaysBounds();

  // 离屏预创建：窗口放在所有屏幕下方
  const initialY = offscreen ? maxY + 100 : minY;

  overlayWindow = new BrowserWindow({
    x: minX,
    y: initialY,
    width,
    height,
    frame: false,
    transparent: true,
    opacity: offscreen ? 1 : 0, // 常规触发时先透明，离屏预创建则不透明（反正看不见）
    alwaysOnTop: !isDebug, // Debug 模式下不置顶
    skipTaskbar: !isDebug,
    resizable: isDebug,
    movable: isDebug,
    maximizable: false,
    fullscreen: false,
    thickFrame: false,
    hasShadow: false,
    // 初始不显示，等待数据准备就绪
    show: false,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(dirname, '../dist/overlay-preload.cjs.js'),
    },
  });

  // 强制设置边界以防被系统截断
  overlayWindow.setBounds({
    x: minX,
    y: initialY,
    width,
    height,
  });

  // 加载叠加层 HTML
  const overlayPath = path.join(dirname, '../dist/overlay.html');
  overlayWindow.loadFile(overlayPath);

  if (isDebug) {
    overlayWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 设置窗口忽略鼠标事件（初始状态）
  overlayWindow.setIgnoreMouseEvents(false);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    currentCaptureSession = null; // 清理会话缓存
  });

  // 离屏预创建时，加载完成后 show 窗口但保持在离屏位置
  // 这样 WebContents 进入活跃状态，IPC 通信不会被延迟
  if (offscreen) {
    overlayWindow.once('ready-to-show', () => {
      // isDestroyed 保护
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.showInactive();
        overlayWindow.setIgnoreMouseEvents(true);
        logger.info(`Overlay 离屏预创建完成 (0, ${initialY})`);
      }
    });
  }

  return overlayWindow;
};

/**
 * 预捕获所有屏幕画面
 * 返回原始数据用于后续处理，并关联 Electron 的显示器信息（缩放倍数）
 */
const preCaptureAllScreens = async (startTime = Date.now(), isDebug = false) => {
  const electronDisplays = screen.getAllDisplays();
  const nativeDisplays = capture.getDisplays();

  logger.info(`[Perf] 开始预捕获 (T+${Date.now() - startTime}ms). 检测到原生显示器数量:`, { data: { count: nativeDisplays.length } });

  // 读取 HDR 映射配置
  const enableHdrMapping = getEnableHdrMapping();
  const sdrWhiteNits = getSdrWhiteNits();
  const hdrMaxNits = getHdrMaxNits();
  const preserveHdr = getPreserveHdr();
  const captureCursor = getCaptureCursor();

  // 构建 HDR 映射选项（仅在启用时传递）
  const hdrOptions = enableHdrMapping ? {
    enabled: true,
    sdrWhiteNits,
    hdrMaxNits,
    preserveHdr, // 注意：传递给 native 的参数名和 config 可能略有不同，这里复用 preserveHdr
    preserveRaw: preserveHdr,
  } : null;

  logger.info('HDR 映射配置:', {
    data: {
      enableHdrMapping,
      sdrWhiteNits,
      hdrMaxNits,
      preserveHdr,
      captureCursor,
    },
  });

  const capturePromises = nativeDisplays.map(async (nd) => {
    try {
      const t0 = Date.now();
      logger.info(`[Perf] 正在捕获显示器 ID=${nd.id} (预期 ${nd.width}x${nd.height}) ...`);
      const {
        buffer, width, height, isHdr, rawHdrBuffer,
      } = await capture.captureDisplay(nd.id, hdrOptions, captureCursor);

      const t1 = Date.now();
      logger.info(`[Perf] 显示器 ID=${nd.id} 捕获完成, 耗时: ${t1 - t0}ms(T+${t1 - startTime}ms). 实际尺寸 ${width}x${height}, Buffer: ${buffer ? buffer.length : 0}, IS_HDR: ${isHdr}`);

      // Debug 模式下，如果是非 HDR 屏幕，强制执行一次 Tone Mapping 以测试性能
      if (isDebug && !isHdr && buffer && buffer.length > 0) {
        try {
          logger.info('[Perf] (Debug模式) 强制对 SDR 数据执行 Tone Mapping 测试...');
          const tMap0 = Date.now();
          // 注意：SDR 数据丢进去 toneMap 处理结果虽然色彩不对，但计算过程是一样的，足以反映耗时
          await capture.toneMap(buffer, width, height, { exposure: 1.0 });
          const tMap1 = Date.now();
          logger.info(`[Perf] (Debug模式) 强制 Tone Mapping 耗时: ${tMap1 - tMap0}ms(T+${tMap1 - startTime}ms)`);
        } catch (tmErr) {
          logger.error('强制 Tone Mapping 测试失败:', tmErr);
        }
      }

      if (!buffer || buffer.length === 0) {
        logger.warn(`显示器 ID=${nd.id} 返回的 Buffer 为空`);
        return null;
      }

      // 找到包含该 native 显示器中心点的 Electron 显示器，以获取 scaleFactor
      const centerX = nd.x + nd.width / 2;
      const centerY = nd.y + nd.height / 2;
      const ed = electronDisplays.find((d) => {
        const b = d.bounds;
        return centerX >= b.x && centerX <= b.x + b.width
               && centerY >= b.y && centerY <= b.y + b.height;
      }) || electronDisplays[0];

      return {
        displayId: nd.id,
        buffer,
        width,
        height,
        scaleFactor: ed.scaleFactor,
        bounds: ed.bounds,
        isHdr,
        rawHdrBuffer, // 保存原始 HDR 数据 (如果有)
      };
    } catch (err) {
      logger.error(`显示器 ID=${nd.id} 捕获发生异常:`, err);
      return null;
    }
  });

  const results = await Promise.allSettled(capturePromises);
  const finalResults = results
    .filter((result) => result.status === 'fulfilled' && result.value !== null)
    .map((result) => result.value);

  logger.info(`[Perf] 预捕获全部完成 (T+${Date.now() - startTime}ms), 成功获取到 ${finalResults.length} 张屏幕画面`);
  return finalResults;
};

/**
 * 启动截图流程
 */
const startCapture = async (isDebug = false, startTime = Date.now()) => {
  logger.info(`[Perf] startCapture 开始 (T+${Date.now() - startTime}ms)`);

  // [性能优化] 尽早确保窗口已创建，让 WebContents 加载与截图过程并行
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    logger.info(`[Perf] 预创建 Overlay 窗口 (T+${Date.now() - startTime}ms)`);
    createOverlayWindow(isDebug);
  }

  // 获取最新显示器边界信息（每次都需要重新获取，以应对屏幕状态变更）
  const {
    displays: allDisplays, minX, minY, maxY, width: totalWidth, height: totalHeight,
  } = getAllDisplaysBounds();

  // 如果窗口已存在、由于离屏策略处于“可见”状态且坐标在有效范围内，说明正在截图中，直接聚焦
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    const { y } = overlayWindow.getBounds();

    // 如果 y 坐标小于 maxY，说明窗口当前在某个显示器范围内，即正在截图中
    // 只有当它真的在屏幕内时才直接 focus
    if (y < maxY) {
      overlayWindow.focus();
      return;
    }
  }

  // 等待 DWM 状态稳定
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  logger.info(`[Perf] DWM 稳定等待结束 (T+${Date.now() - startTime}ms)`);

  // 预先捕获所有屏幕画面（冻结画面）
  let sessionData = [];
  // 并行地为 UI 准备编码后的画面 (WebP)
  let capturedScreens = [];

  // 尝试真实截图 (无论是否 Debug，都尝试截图以支持性能测试)
  sessionData = await preCaptureAllScreens(startTime, isDebug);

  if (sessionData && sessionData.length > 0) {
    currentCaptureSession = sessionData;

    logger.info(`[Perf] 开始编码预览图 (T+${Date.now() - startTime}ms)...`);
    // 准备 UI 预览数据
    capturedScreens = await Promise.all(sessionData.map(async (s) => {
      const tEncode0 = Date.now();
      const data = await capture.encodeImage(s.buffer, s.width, s.height, 'webp');
      const tEncode1 = Date.now();
      logger.info(`[Perf] 编码显示器 ${s.displayId} 为 WebP 耗时: ${tEncode1 - tEncode0}ms`);
      return {
        displayId: s.displayId,
        bounds: s.bounds,
        data,
      };
    }));
    logger.info(`[Perf] 所有预览图编码完成 (T+${Date.now() - startTime}ms)`);
  } else if (!isDebug) {
    // 非 Debug 模式下，截图失败则是致命错误
    logger.error('启动失败: 未能捕获到任何屏幕画面。请检查原生模块加载状态及录屏权限。');
    return;
  } else {
    // Debug 模式下，截图失败（或空）则使用 Mock 数据启动 UI
    logger.info('Debug 模式：真实截图未返回数据，提供空/Mock数据以启动 UI');
    capturedScreens = []; // 或者这里可以 push 一些 mock 数据，但原代码是空的，维持原状
  }

  // 获取鼠标当前位置，用于判断初始应高亮哪个屏幕
  const cursorPos = screen.getCursorScreenPoint();

  // 坐标转换后保留的窗口项
  const tWin0 = Date.now();
  const nativeWindows = capture.getTopLevelWindows();
  logger.info(`[Perf] 获取顶层窗口耗时: ${Date.now() - tWin0}ms, 数量: ${nativeWindows.length}`);

  const windows = nativeWindows.map((win) => {
    try {
      const topLeft = screen.screenToDipPoint({ x: win.left, y: win.top });
      const bottomRight = screen.screenToDipPoint({ x: win.right, y: win.bottom });
      return {
        ...win,
        left: topLeft.x,
        top: topLeft.y,
        right: bottomRight.x,
        bottom: bottomRight.y,
        width: Math.abs(bottomRight.x - topLeft.x),
        height: Math.abs(bottomRight.y - topLeft.y),
      };
    } catch (e) {
      logger.error(`转换窗口坐标失败 [${win.title}]:`, e);
      return null;
    }
  }).filter(Boolean);

  // 为每个显示器添加独立的自动选区候选
  allDisplays.forEach((d, idx) => {
    windows.push({
      handle: 0,
      title: `显示器 ${idx + 1} (${d.bounds.width}x${d.bounds.height})`,
      class_name: 'Display',
      left: d.bounds.x,
      top: d.bounds.y,
      right: d.bounds.x + d.bounds.width,
      bottom: d.bounds.y + d.bounds.height,
      width: d.bounds.width,
      height: d.bounds.height,
    });
  });

  if (windows.length > 0) {
    logger.info(`坐标转换后保留 ${windows.length} 个项 (含窗口和显示器)`);
  } else {
    logger.warn('未能成功转换任何窗口坐标或搜索结果为空');
  }

  // 立即显示或移动窗口
  // 确保窗口位置正确（强制移动到 minX, minY）
  // 注意：显示逻辑推迟到 sendDataAndShow 中

  // 准备初始化数据
  const initData = {
    isDebug,
    minX,
    minY,
    width: totalWidth,
    height: totalHeight,
    capturedScreens,
    cursorPos,
    windows, // 发送窗口数据
    displays: allDisplays.map((d) => ({
      id: d.id,
      bounds: d.bounds,
    })),
    // 传递触发时间戳，供 UI 计算总耗时
    startTime,
  };

  const sendDataAndShow = () => {
    logger.info(`[Perf] 发送初始化数据 (T+${Date.now() - startTime}ms), 截图数量: ${capturedScreens.length}, 窗口数量: ${windows.length}, isDebug: ${isDebug}`);

    // 在发送数据前，强制更新窗口边界以匹配当前屏幕配置
    // 这修复了屏幕状态变更（如全屏游戏切换分辨率）后覆盖层位置/尺寸异常的问题
    overlayWindow.setBounds({
      x: minX, y: minY, width: totalWidth, height: totalHeight,
    });

    overlayWindow.webContents.send(`overlay-init@${PLUGIN_ID}`, initData);

    // 数据发送后，再次确保窗口在可见区域
    // 这样用户看到的每一帧都是已加载好截图数据的画面，绝不会看到之前的 UI（放大镜等）

    if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive();
    }

    // 在发送完数据之后，立刻允许交互，但如果是开启快速模式，则立即调焦
    // 不管是什么模式，先让平台停止穿透
    overlayWindow.setIgnoreMouseEvents(false);

    if (getFastResponse()) {
      if (!isDebug) {
        // 强制确保置顶后再 focus 避免在系统最底层
        overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      }
      overlayWindow.focus();
      logger.info(`[Perf] 窗口已显示并聚焦 (T+${Date.now() - startTime}ms)`);
    } else {
      logger.info(`[Perf] 窗口已发送数据，等待 overlay-ready 解除透明 (T+${Date.now() - startTime}ms)`);
    }
  };

  // 如果页面正在加载，等待加载完成
  if (overlayWindow.webContents.isLoading()) {
    overlayWindow.webContents.once('did-finish-load', sendDataAndShow);
  } else {
    // 页面已加载，直接发送数据并显示
    sendDataAndShow();
  }
};

/**
 * 注册全局快捷键
 */
const registerShortcut = (accelerator, reason = 'unknown') => {
  const finalAccelerator = normalizeShortcut(accelerator || getShortcut());
  if (!finalAccelerator) {
    logger.info('[shortcut] 未配置全局快捷键，跳过注册', {
      data: { reason },
    });
    return false;
  }

  // 基础归一化：将 Win 转换为 Super (Electron 规范)

  // 基础校验：不能以 '+' 结尾，且最后一位不能是修饰键（如 "Ctrl+Alt" 是非法的）
  const parts = finalAccelerator.split('+');
  const lastPart = parts[parts.length - 1];
  const modifiers = ['Ctrl', 'Control', 'Alt', 'Shift', 'Super', 'Meta', 'Cmd', 'Command'];
  if (!lastPart || modifiers.includes(lastPart)) {
    // 这是一个不完整的快捷键，忽略注册过程
    return false;
  }

  // 防止重复注册相同的快捷键
  if (registeredShortcut === finalAccelerator) {
    return true;
  }

  // 先注销已有快捷键
  unregisterShortcut(`before-register:${reason}`);

  try {
    const success = globalShortcut.register(finalAccelerator, () => {
      const now = Date.now();
      logger.info(`[Perf] 快捷键触发: ${finalAccelerator} (T+0ms)`);
      startCapture(false, now).catch((err) => {
        logger.error('快捷键触发 startCapture 失败:', err);
      });
    });

    if (success) {
      logger.info(`快捷键注册成功: ${finalAccelerator}`);
      registeredShortcut = finalAccelerator;
    } else {
      logger.error(`快捷键注册失败: ${finalAccelerator} (可能已被占用)`);
    }

    return success;
  } catch (e) {
    logger.error(`注册快捷键时发生错误: ${finalAccelerator}`, e);
    return false;
  }
};

/**
 * 关闭截图叠加层
 */
const syncShortcutRegistration = ({
  accelerator,
  reason = 'unknown',
} = {}) => {
  const configuredShortcut = typeof accelerator === 'string'
    ? accelerator
    : getShortcut();
  const normalizedShortcut = normalizeShortcut(configuredShortcut);

  logger.info('[shortcut] 开始同步全局快捷键', {
    data: {
      reason,
      configuredShortcut,
      normalizedShortcut,
      registeredShortcut,
      appReady: app.isReady(),
    },
  });

  if (!normalizedShortcut) {
    unregisterShortcut(`sync-empty:${reason}`);
    logger.info('[shortcut] 当前未配置快捷键', {
      data: { reason },
    });
    return false;
  }

  if (isIncompleteShortcut(normalizedShortcut)) {
    logger.warn('[shortcut] 快捷键配置不完整，已跳过注册', {
      data: {
        reason,
        accelerator: normalizedShortcut,
      },
    });
    return false;
  }

  if (!app.isReady()) {
    logger.warn('[shortcut] 应用尚未就绪，等待 app.whenReady 后重试', {
      data: {
        reason,
        accelerator: normalizedShortcut,
      },
    });
    app.whenReady()
      .then(() => {
        syncShortcutRegistration({
          accelerator: normalizedShortcut,
          reason: `${reason}:after-ready`,
        });
      })
      .catch((error) => {
        logger.error('[shortcut] 等待应用就绪时发生错误', error);
      });
    return false;
  }

  if (registeredShortcut === normalizedShortcut) {
    const isRegistered = globalShortcut.isRegistered(normalizedShortcut);
    if (isRegistered) {
      logger.info('[shortcut] 快捷键已处于注册状态，跳过重复注册', {
        data: {
          reason,
          accelerator: normalizedShortcut,
        },
      });
      return true;
    }

    logger.warn('[shortcut] 内部记录存在但系统未注册，准备重新注册', {
      data: {
        reason,
        accelerator: normalizedShortcut,
      },
    });
    registeredShortcut = null;
  }

  return registerShortcut(normalizedShortcut, reason);
};

const normalizeNativeInteger = (value, fallback = 0) => {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

const runWithOverlayHitTestDisabled = (fn) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return fn();
  }

  try {
    overlayWindow.setIgnoreMouseEvents(true);
    return fn();
  } finally {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  }
};

const closeOverlay = () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // 无论普通模式还是快速模式，先通知 UI 重置状态（清空画面）
    // 这能有效防止“Ghosting”重叠显示问题，并减少离屏时的内存占用
    try {
      overlayWindow.webContents.send(`overlay-reset@${PLUGIN_ID}`);
    } catch (e) {
      // ignore
    }

    if (getFastResponse()) {
      // 快速响应模式：将窗口移出屏幕外部
      // 动态计算所有显示器的最下方边界，将窗口放在其下方，确保绝对不可见
      const { maxY } = getAllDisplaysBounds();

      overlayWindow.setIgnoreMouseEvents(true);
      overlayWindow.setPosition(0, maxY + 100);
      logger.info(`快速响应模式: Overlay 已移至离屏常驻 (0, ${maxY + 100})`);
    } else {
      // 普通模式：销毁窗口
      overlayWindow.close();
      overlayWindow = null;
      logger.info('Overlay 已关闭');
    }
    // 无论哪种模式，这里可以清理一下当前的 session 数据，释放内存
    currentCaptureSession = null;
  }
};

// ==================== 插件生命周期 ====================

/**
 * 插件加载时执行
 */
export const pluginDidLoad = () => {
  logger.info('插件已加载', {
    data: {
      shortcut: getShortcut(),
      fastResponse: getFastResponse(),
      appReady: app.isReady(),
    },
  });
  syncShortcutRegistration({ reason: 'pluginDidLoad' });

  // 快速响应模式下，预创建离屏 Overlay 窗口，消除首次截图冷启动延迟
  if (getFastResponse()) {
    createOverlayWindow(false, true);
  }

  // 监听屏幕变化
  screen.on('display-metrics-changed', updateOverlayBounds);
  screen.on('display-added', updateOverlayBounds);
  screen.on('display-removed', updateOverlayBounds);
};

/**
 * 插件卸载时执行
 */
export const pluginWillUnload = () => {
  logger.info('插件正在卸载');

  // 注销快捷键
  unregisterShortcut('pluginWillUnload');

  // 移除屏幕监听
  screen.removeListener('display-metrics-changed', updateOverlayBounds);
  screen.removeListener('display-added', updateOverlayBounds);
  screen.removeListener('display-removed', updateOverlayBounds);

  // 关闭叠加层窗口 (强制关闭，不考虑 fastResponse)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
    overlayWindow = null;
  }
};

/**
 * 设置保存时执行
 */
export const pluginSettingSaved = () => {
  logger.info('设置已保存', {
    data: {
      shortcut: getShortcut(),
      fastResponse: getFastResponse(),
    },
  });
  syncShortcutRegistration({ reason: 'pluginSettingSaved' });

  // 检查快速响应模式设置
  const isFastResponse = getFastResponse();

  if (!isFastResponse) {
    // 如果用户关闭了快速响应模式，且当前有隐藏的窗口，将其销毁
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
      logger.info('快速响应模式已关闭，清理现存窗口');
    }
  } else if (isFastResponse && (!overlayWindow || overlayWindow.isDestroyed())) {
    // 如果用户开启了快速响应模式，但当前没有窗口，重新预创建
    logger.info('快速响应模式已开启，预创建离屏窗口');
    createOverlayWindow(false, true);
  }
};

export const ipcHandlers = [
  {
    type: 'start-capture',
    handler: () => async ({ isDebug = false }) => {
      await startCapture(isDebug, Date.now());
    },
  },
  {
    type: 'close-overlay',
    handler: () => () => {
      closeOverlay();
    },
  },
  {
    type: 'overlay-ready',
    handler: () => () => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        const opacity = overlayWindow.getOpacity();
        if (opacity < 1) {
          overlayWindow.setOpacity(1);
        }
        // 确保能进行交互，并强制置顶
        // 这里不检测 isDebug，是因为我们在 getWindowAtPoint 也不会受到这行影响
        // 但如果是在开发模式下一直顶层有点烦，所以还是保留判断比较好
        // 由于 ipcRenderer 传不来 isDebug，我们可以去判断一下 window options
        if (overlayWindow.isAlwaysOnTop() || overlayWindow.webContents.isDevToolsOpened() === false) {
          overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        }

        overlayWindow.focus();
        overlayWindow.setIgnoreMouseEvents(false);
        logger.info('[Perf] 收到 overlay-ready，已重置透明度并确保聚焦');
      }
    },
  },
  {
    type: 'register-shortcut',
    handler: () => (accelerator) => syncShortcutRegistration({
      accelerator,
      reason: 'ipc:register-shortcut',
    }),
  },
  {
    type: 'unregister-shortcut',
    handler: () => () => unregisterShortcut('ipc:unregister-shortcut'),
  },
  {
    type: 'get-window-at-point',
    handler: () => (x, y) => {
      let ignoreHandle = null;
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        try {
          const handleBuf = overlayWindow.getNativeWindowHandle();
          if (handleBuf.length === 8) {
            ignoreHandle = Number(handleBuf.readBigInt64LE(0));
          } else if (handleBuf.length === 4) {
            ignoreHandle = handleBuf.readInt32LE(0);
          }
        } catch (e) {
          logger.error('获取 Overlay 窗口句柄失败:', e);
        }
      }

      const physicalPoint = screen.dipToScreenPoint({ x: Math.round(x), y: Math.round(y) });
      logger.debug(`Window detection: Logical(${x}, ${y}) -> Physical(${physicalPoint.x}, ${physicalPoint.y})`);

      const win = capture.getWindowAtPoint(physicalPoint.x, physicalPoint.y, ignoreHandle);

      if (win) {
        const topLeft = screen.screenToDipPoint({ x: win.left, y: win.top });
        const bottomRight = screen.screenToDipPoint({ x: win.right, y: win.bottom });

        win.left = topLeft.x;
        win.top = topLeft.y;
        win.right = bottomRight.x;
        win.bottom = bottomRight.y;
        win.width = Math.abs(bottomRight.x - topLeft.x);
        win.height = Math.abs(bottomRight.y - topLeft.y);
      }
      return win;
    },
  },
  {
    type: 'get-top-level-windows',
    handler: () => () => capture.getTopLevelWindows(),
  },
  {
    type: 'get-ui-element-candidates-at-point',
    handler: () => (x, y) => {
      let ignoreHandle = null;
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        try {
          const handleBuf = overlayWindow.getNativeWindowHandle();
          if (handleBuf.length === 8) {
            ignoreHandle = Number(handleBuf.readBigInt64LE(0));
          } else if (handleBuf.length === 4) {
            ignoreHandle = handleBuf.readInt32LE(0);
          }
        } catch (e) {
          logger.error('获取 Overlay 窗口句柄失败:', e);
        }
      }

      const physicalPoint = screen.dipToScreenPoint({ x: Math.round(x), y: Math.round(y) });
      logger.debug('[uia] 开始元素探测', {
        data: {
          logicalPoint: { x, y },
          physicalPoint,
        },
      });
      try {
        const result = runWithOverlayHitTestDisabled(() => capture.getUiElementCandidatesAtPoint(
          physicalPoint.x,
          physicalPoint.y,
          ignoreHandle,
        ));
        const elements = Array.isArray(result) ? result : [];
        logger.debug(`[uia] 元素探测完成, count=${elements.length}`);

        return elements.map((element) => {
          const rawLeft = normalizeNativeInteger(element.left);
          const rawTop = normalizeNativeInteger(element.top);
          const rawRight = normalizeNativeInteger(element.right);
          const rawBottom = normalizeNativeInteger(element.bottom);
          const topLeft = screen.screenToDipPoint({ x: rawLeft, y: rawTop });
          const bottomRight = screen.screenToDipPoint({ x: rawRight, y: rawBottom });
          return {
            id: element.id?.toString?.() ?? '',
            runtimeId: element.runtimeId?.toString?.() ?? '',
            name: element.name ?? '',
            controlType: element.controlType ?? '',
            className: element.className ?? '',
            processId: normalizeNativeInteger(element.processId),
            windowHandle: normalizeNativeInteger(element.windowHandle),
            left: topLeft.x,
            top: topLeft.y,
            right: bottomRight.x,
            bottom: bottomRight.y,
            width: Math.abs(bottomRight.x - topLeft.x),
            height: Math.abs(bottomRight.y - topLeft.y),
          };
        });
      } catch (error) {
        logger.error('[uia] 元素探测主进程失败', {
          data: {
            errorMessage: error?.message,
          },
        });
        throw error;
      }
    },
  },
  {
    type: 'save-capture',
    handler: () => async (rect) => {
      if (!currentCaptureSession) {
        return null;
      }
      const format = getSaveFormat();
      const savePath = getSavePath();
      const preserveHdr = getPreserveHdr();
      const saveFilenameTemplate = getSaveFilenameTemplate();
      logger.info('保存截图', {
        data: {
          saveINfo: {
            format,
            savePath,
            preserveHdr,
            saveFilenameTemplate,
          },
        },
      });
      const result = await capture.cropAndSaveScaledFromBuffer(currentCaptureSession, rect, {
        format, savePath, preserveHdr, saveFilenameTemplate,
      });
      if (result) {
        logger.info('触发保存完成事件');
        bus.emit('capture-complete', { path: result.path, hdrPath: result.hdrPath, type: 'save' });
      }
      return result?.path ?? null;
    },
  },
  {
    type: 'copy-capture',
    handler: () => async (rect) => {
      logger.info('收到 copy-capture 请求');
      if (!currentCaptureSession) {
        logger.error('copy-capture 失败: 没有当前的截图会话');
        return null;
      }

      try {
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          logger.error('copy-capture 失败: 无效的选区尺寸');
          return false;
        }

        // 执行复制
        logger.info('开始进行裁剪编码...');
        const pngBuffer = await capture.cropAndGetPngFromBuffer(currentCaptureSession, rect);

        if (pngBuffer && pngBuffer.length > 0) {
          logger.info(`编码成功, Buffer 长度: ${pngBuffer.length}, 开始写入剪贴板`);
          const { clipboard, nativeImage } = await import('electron');
          const image = nativeImage.createFromBuffer(pngBuffer);
          clipboard.writeImage(image);
          logger.info('写入剪贴板完成');
          bus.emit('capture-complete', { path: null, hdrPath: null, type: 'copy' });
          return true;
        }
        logger.error('copy-capture 失败: 编码返回的 Buffer 为空');
        return false;
      } catch (err) {
        logger.error('copy-capture 发生异常:', err);
        return false;
      }
    },
  },
  {
    type: 'get-default-save-path',
    handler: () => async () => app.getPath('pictures'),
  },
  {
    type: 'get-system-sdr-white-nits',
    handler: () => async () => {
      const primaryDisplay = screen.getPrimaryDisplay();
      const nativeDisplays = capture.getDisplays();
      const centerX = primaryDisplay.bounds.x + (primaryDisplay.bounds.width / 2);
      const centerY = primaryDisplay.bounds.y + (primaryDisplay.bounds.height / 2);
      const matchedDisplay = nativeDisplays.find((display) => (
        centerX >= display.x
        && centerX <= display.x + display.width
        && centerY >= display.y
        && centerY <= display.y + display.height
      )) || nativeDisplays.find((display) => display.isPrimary) || nativeDisplays[0];

      if (!matchedDisplay) {
        return null;
      }

      return capture.getDisplayColorInfo(matchedDisplay.id);
    },
  },
];

/**
 * 跨插件通信 API
 * 其他插件通过 pluginInterop 获取此对象后，可监听截图完成事件
 *
 * @example
 * const interop = usePluginInterop();
 * const hdrApi = interop.getExports('translime-plugin-hdr-capture');
 * hdrApi.onCaptureComplete(({ path, hdrPath, type }) => {
 *   // path: 保存时为文件路径，复制时为 null
 *   // hdrPath: HDR 原始文件路径（未开启或保存失败时为 null）
 *   // type: 'save' | 'copy'
 * });
 */
export const libs = {
  /**
   * 监听截图完成事件
   * @param {(detail: { path: string|null, hdrPath: string|null, type: 'save'|'copy' }) => void} fn 回调函数
   */
  onCaptureComplete: (fn) => bus.on('capture-complete', fn),

  /**
   * 移除截图完成事件监听
   * @param {Function} fn 之前注册的回调函数
   */
  offCaptureComplete: (fn) => bus.off('capture-complete', fn),
};
