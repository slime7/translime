import {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
} from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useLogger, usePluginConfig } from 'translime-sdk';
// eslint-disable-next-line import/extensions
import * as capture from './capture/index.js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const PLUGIN_ID = 'translime-plugin-hdr-capture';
const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Main' }) : baseLogger;

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
    width: maxX - minX,
    height: maxY - minY,
  };
};

const getSaveFilenameTemplate = () => pluginConfig.get('saveFilenameTemplate', '');
const getFastResponse = () => pluginConfig.get('fastResponse', true);

/**
 * 更新 Overlay 窗口的边界（用于响应屏幕变化）
 */
const updateOverlayBounds = () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const {
    minX, minY, width, height,
  } = getAllDisplaysBounds();

  overlayWindow.setBounds({
    x: minX,
    y: minY,
    width,
    height,
  });
  logger.info(`屏幕变动，已更新 Overlay 边界: ${width}x${height} at (${minX}, ${minY})`);
};

/**
 * 注销全局快捷键
 */
const unregisterShortcut = () => {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    logger.info(`快捷键已注销: ${registeredShortcut}`);
    registeredShortcut = null;
  }
};


const createOverlayWindow = (isDebug = false) => {
  const {
    minX, minY, width, height,
  } = getAllDisplaysBounds();

  overlayWindow = new BrowserWindow({
    x: minX,
    y: minY,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: !isDebug, // Debug 模式下不置顶
    skipTaskbar: !isDebug,
    resizable: isDebug,
    movable: isDebug,
    maximizable: true,
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
    y: minY,
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

  return overlayWindow;
};

/**
 * 预捕获所有屏幕画面
 * 返回原始数据用于后续处理，并关联 Electron 的显示器信息（缩放倍数）
 */
const preCaptureAllScreens = async () => {
  const electronDisplays = screen.getAllDisplays();
  const nativeDisplays = capture.getDisplays();

  logger.info('开始预捕获。检测到原生显示器数量:', nativeDisplays.length);

  // 读取 HDR 映射配置
  const enableHdrMapping = getEnableHdrMapping();
  const sdrWhiteNits = getSdrWhiteNits();
  const hdrMaxNits = getHdrMaxNits();
  const preserveHdr = getPreserveHdr();

  // 构建 HDR 映射选项（仅在启用时传递）
  const hdrOptions = enableHdrMapping ? {
    enabled: true,
    sdrWhiteNits,
    hdrMaxNits,
    // 当用户启用了 HDR 映射且勾选了保存 HDR 原始文件时，请求原始数据
    preserveRaw: preserveHdr,
  } : null;

  logger.info('HDR 映射配置:', {
    enableHdrMapping, sdrWhiteNits, hdrMaxNits, preserveHdr,
  });

  const capturePromises = nativeDisplays.map(async (nd) => {
    try {
      logger.info(`正在捕获显示器 ID=${nd.id} (预期 ${nd.width}x${nd.height})`);
      const {
        buffer, width, height, isHdr, rawHdrBuffer,
      } = await capture.captureDisplay(nd.id, hdrOptions);

      if (!buffer || buffer.length === 0) {
        logger.warn(`显示器 ID=${nd.id} 返回的 Buffer 为空`);
        return null;
      }

      logger.info(`显示器 ID=${nd.id} 捕获成功: 实际尺寸 ${width}x${height}, Buffer 长度 ${buffer.length}, IS_HDR: ${isHdr}, 原始 HDR 数据: ${rawHdrBuffer ? rawHdrBuffer.length : 'N/A'}`);

      // 找到包含该 native 显示器中心点的 Electron 显示器，以获取 scaleFactor
      const centerX = nd.x + nd.width / 2;
      const centerY = nd.y + nd.height / 2;
      const ed = electronDisplays.find((d) => {
        const b = d.bounds;
        return centerX >= b.x && centerX <= b.x + b.width
               && centerY >= b.y && centerY <= b.y + b.height;
      }) || electronDisplays[0];

      logger.info(`显示器 ID=${nd.id} 匹配到 Electron 显示器: scale=${ed.scaleFactor}`);

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

  logger.info(`预捕获完成，成功获取到 ${finalResults.length} 张屏幕画面`);
  return finalResults;
};

/**
 * 启动截图流程
 */
const startCapture = async (isDebug = false) => {
  // 如果窗口已存在且可见，说明正在截图中，直接聚焦
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.focus();
    return;
  }

  // 等待 DWM 状态稳定
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });

  // 预先捕获所有屏幕画面（冻结画面）
  let sessionData = [];
  // 并行地为 UI 准备编码后的画面 (WebP)
  let capturedScreens = [];

  if (!isDebug) {
    sessionData = await preCaptureAllScreens();

    if (!sessionData || sessionData.length === 0) {
      logger.error('启动失败: 未能捕获到任何屏幕画面。请检查原生模块加载状态及录屏权限。');
      // 可以考虑这里弹出一个对话框通知用户
      return;
    }

    currentCaptureSession = sessionData;

    // 准备 UI 预览数据
    capturedScreens = await Promise.all(sessionData.map(async (s) => ({
      displayId: s.displayId,
      bounds: s.bounds,
      data: await capture.encodeImage(s.buffer, s.width, s.height, 'webp'),
    })));
  } else {
    logger.info('Debug 模式：跳过实际截屏，提供空数据以启动 UI');
  }

  // 获取鼠标当前位置，用于判断初始应高亮哪个屏幕
  const cursorPos = screen.getCursorScreenPoint();

  // 获取所有顶层窗口信息用于点击识别
  const nativeWindows = capture.getTopLevelWindows();
  logger.info(`原生模块返回 ${nativeWindows.length} 个窗口`);

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

  const {
    displays: allDisplays, minX, minY, width: totalWidth, height: totalHeight,
  } = getAllDisplaysBounds();

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

  // 确保窗口已创建
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow(isDebug);
  } else {
    // 如果窗口已存在（常驻模式），确保边界正确
    updateOverlayBounds();
  }

  // 立即显示窗口但设为全透明，让系统动画在数据加载期间完成，或者完全绕过动画感观
  if (!overlayWindow.isVisible()) {
    overlayWindow.setOpacity(0);
    overlayWindow.show();
  } else if (overlayWindow.getOpacity() === 0) {
    // 窗口已显示但处于透明状态
    // 保持透明，直到数据通过
  }

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
  };

  const sendDataAndShow = () => {
    logger.info(`发送初始化数据, 截图数量: ${capturedScreens.length}, 窗口数量: ${windows.length}, isDebug: ${isDebug}`);
    overlayWindow.webContents.send(`overlay-init@${PLUGIN_ID}`, initData);

    // 数据就绪，瞬间显示
    overlayWindow.setOpacity(1);
    overlayWindow.focus();
    overlayWindow.setIgnoreMouseEvents(false);
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
const registerShortcut = (accelerator) => {
  let finalAccelerator = accelerator || getShortcut();
  if (!finalAccelerator) return false;

  // 基础归一化：将 Win 转换为 Super (Electron 规范)
  finalAccelerator = finalAccelerator.replace(/Win/g, 'Super');

  // 基础校验：不能以 '+' 结尾，且最后一位不能是修饰键（如 "Ctrl+Alt" 是非法的）
  const parts = finalAccelerator.split('+');
  const lastPart = parts[parts.length - 1];
  const modifiers = ['Ctrl', 'Control', 'Alt', 'Shift', 'Super', 'Meta', 'Cmd', 'Command'];
  if (!lastPart || modifiers.includes(lastPart)) {
    // 这是一个不完整的快捷键，忽略注册过程
    return false;
  }

  // 先注销已有快捷键
  unregisterShortcut();

  try {
    const success = globalShortcut.register(finalAccelerator, () => {
      logger.info(`触发快捷键: ${finalAccelerator}`);
      startCapture().catch((err) => {
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
const closeOverlay = () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (getFastResponse()) {
      // 快速响应模式：隐藏窗口而不是销毁
      overlayWindow.hide();
      overlayWindow.setIgnoreMouseEvents(true); // 隐藏时忽略鼠标，以防万一
      // 可选：通知 UI 重置状态，避免下次打开时看到旧画面一闪而过
      // overlayWindow.webContents.send(`overlay-reset@${PLUGIN_ID}`);
      logger.info('快速响应模式: Overlay 已隐藏');
    } else {
      // 普通模式：销毁窗口
      overlayWindow.close();
      overlayWindow = null;
      logger.info('Overlay 已关闭');
    }
    // 无论哪种模式，这里可以清理一下当前的 session 数据，释放内存
    // 但如果在 fastResponse 模式下，保留它也没关系，毕竟下次 startCapture 会覆盖
    // 为了节省内存，建议清理
    currentCaptureSession = null;
  }
};

// ==================== 插件生命周期 ====================

/**
 * 插件加载时执行
 */
export const pluginDidLoad = () => {
  logger.info('插件已加载');

  // 如果设置了快捷键，则注册
  const shortcut = getShortcut();
  if (shortcut) {
    registerShortcut(shortcut);
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
  unregisterShortcut();

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
  logger.info('设置已保存');

  // 重新注册快捷键
  const shortcut = getShortcut();
  if (shortcut) {
    registerShortcut(shortcut);
  } else {
    unregisterShortcut();
  }

  // 检查快速响应模式设置
  // 如果用户关闭了快速响应模式，且当前有隐藏的常驻窗口，则将其销毁以释放内存
  const isFastResponse = getFastResponse();
  if (!isFastResponse && overlayWindow && !overlayWindow.isDestroyed() && !overlayWindow.isVisible()) {
    overlayWindow.close();
    overlayWindow = null;
    logger.info('快速响应模式已关闭，清理后台常驻窗口');
  }
};

export const ipcHandlers = [
  {
    type: 'start-capture',
    handler: () => async ({ isDebug = false }) => {
      await startCapture(isDebug);
    },
  },
  {
    type: 'close-overlay',
    handler: () => () => {
      closeOverlay();
    },
  },
  {
    type: 'register-shortcut',
    handler: () => (accelerator) => registerShortcut(accelerator),
  },
  {
    type: 'unregister-shortcut',
    handler: () => () => unregisterShortcut(),
  },
  {
    type: 'get-window-at-point',
    handler: () => (x, y) => {
      let ignoreHandle = null;
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        try {
          const handleBuf = overlayWindow.getNativeWindowHandle();
          // 读取句柄缓冲区
          if (handleBuf.length === 8) {
            ignoreHandle = handleBuf.readBigInt64LE(0);
          } else if (handleBuf.length === 4) {
            ignoreHandle = BigInt(handleBuf.readInt32LE(0));
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
        saveINfo: {
          format,
          savePath,
          preserveHdr,
          saveFilenameTemplate,
        },
      });
      return capture.cropAndSaveScaledFromBuffer(currentCaptureSession, rect, {
        format, savePath, preserveHdr, saveFilenameTemplate,
      });
    },
  },
  {
    type: 'copy-capture',
    handler: () => async (rect) => {
      logger.info('收到 copy-capture 请求, rect:', rect);
      if (!currentCaptureSession) {
        logger.error('copy-capture 失败: 没有当前的截图会话');
        return null;
      }

      try {
        if (!rect || rect.width <= 0 || rect.height <= 0) {
          logger.error('copy-capture 失败: 无效的选区尺寸', rect);
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
];
