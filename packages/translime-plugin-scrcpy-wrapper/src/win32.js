import { createRequire } from 'node:module';
import { nativeImage } from 'electron';
import { fitVideoRect } from './window-size';
import createResizeScheduler from './resize-scheduler';

const requireNative = createRequire(import.meta.url);

export const GWL_STYLE = -16;
export const WM_EXITSIZEMOVE = 0x0232;

const GA_ROOT = 2;

// 窗口样式值含第 31 位（WS_POPUP），超出 JS 32 位位运算范围，必须经 BigInt 参与运算
const WS_VISIBLE = 0x10000000n;
const WS_CLIPCHILDREN = 0x02000000n;
const WS_CHILD = 0x40000000n;
const WS_POPUP = 0x80000000n;

// 非客户区样式
const WS_CAPTION = 0x00c00000n;
const WS_THICKFRAME = 0x00040000n;
const WS_SYSMENU = 0x00080000n;
const WS_MINIMIZEBOX = 0x00020000n;
const WS_MAXIMIZEBOX = 0x00010000n;
const NONCLIENT_STYLES = WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;

const GW_CHILD = 5;

// hWndInsertAfter 取值：HWND_TOP 抬到同层级最上层，HWND_BOTTOM 压到最底层
const HWND_TOP = 0;
const HWND_BOTTOM = 1;

const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SWP_HIDEWINDOW = 0x0080;

// PrintWindow 标志：只取客户区（画面区），并强制 DWM 合成内容（SDL 为 GPU 渲染窗口）
const PW_CLIENTONLY = 0x00000001;
const PW_RENDERFULLCONTENT = 0x00000002;

let bindings = null;
let bindingsError = null;

const loadBindings = () => {
  if (bindings) {
    return bindings;
  }
  if (bindingsError) {
    throw bindingsError;
  }
  if (process.platform !== 'win32') {
    bindingsError = new Error('scrcpy 画面挂载仅支持 Windows 平台');
    throw bindingsError;
  }
  try {
    const koffi = requireNative('koffi');
    // koffi 类型注册表在宿主进程内共享，插件热重载会重复执行本模块，
    // 用随机后缀避免 RECT 与 POINT 结构体重名冲突
    const suffix = Math.random().toString(36).slice(2);
    const rectName = `scrcpy_wrapper_rect_${suffix}`;
    const RECT = koffi.struct(rectName, {
      left: 'int32_t',
      top: 'int32_t',
      right: 'int32_t',
      bottom: 'int32_t',
    });
    const pointName = `scrcpy_wrapper_pt_${suffix}`;
    const POINT = koffi.struct(pointName, {
      x: 'int32_t',
      y: 'int32_t',
    });
    const bitmapInfoName = `scrcpy_wrapper_bmi_${suffix}`;
    const BITMAPINFOHEADER = koffi.struct(bitmapInfoName, {
      biSize: 'uint32_t',
      biWidth: 'int32_t',
      biHeight: 'int32_t',
      biPlanes: 'uint16_t',
      biBitCount: 'uint16_t',
      biCompression: 'uint32_t',
      biSizeImage: 'uint32_t',
      biXPelsPerMeter: 'int32_t',
      biYPelsPerMeter: 'int32_t',
      biClrUsed: 'uint32_t',
      biClrImportant: 'uint32_t',
    });
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const gdi32 = koffi.load('gdi32.dll');
    bindings = {
      RECT,
      POINT,
      // koffi 2.x 的 struct 类型不能 new，出参结构体经 alloc/decode 读写
      rectPtr: koffi.alloc(RECT, 1),
      decodeRect: (ptr) => koffi.decode(ptr, RECT),
      pointPtr: koffi.alloc(POINT, 1),
      decodePoint: (ptr) => koffi.decode(ptr, POINT),
      bitmapInfoSize: koffi.sizeof(BITMAPINFOHEADER),
      FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const str16 lpClassName, const str16 lpWindowName)'),
      GetWindow: user32.func('intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t nCmd)'),
      SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t hWndChild, intptr_t hWndNewParent)'),
      GetAncestor: user32.func('intptr_t __stdcall GetAncestor(intptr_t hWnd, uint32_t nCmd)'),
      GetWindowLongPtrW: user32.func('uintptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int32_t nIndex)'),
      SetWindowLongPtrW: user32.func('uintptr_t __stdcall SetWindowLongPtrW(intptr_t hWnd, int32_t nIndex, uintptr_t dwNewLong)'),
      SetWindowPos: user32.func('int8_t __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int32_t X, int32_t Y, int32_t cx, int32_t cy, uint32_t uFlags)'),
      AttachThreadInput: user32.func('int8_t __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, int8_t fAttach)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, uint32_t *lpdwProcessId)'),
      GetClientRect: user32.func(`int8_t __stdcall GetClientRect(intptr_t hWnd, ${rectName} *lpRect)`),
      GetCursorPos: user32.func(`int8_t __stdcall GetCursorPos(${pointName} *lpPoint)`),
      ScreenToClient: user32.func(`int8_t __stdcall ScreenToClient(intptr_t hWnd, ${pointName} *lpPoint)`),
      SetWindowRgn: user32.func('int32_t __stdcall SetWindowRgn(intptr_t hWnd, intptr_t hRgn, int8_t bRedraw)'),
      PrintWindow: user32.func('int8_t __stdcall PrintWindow(intptr_t hWnd, intptr_t hdcBlt, uint32_t nFlags)'),
      GetWindowDC: user32.func('intptr_t __stdcall GetWindowDC(intptr_t hWnd)'),
      ReleaseDC: user32.func('int32_t __stdcall ReleaseDC(intptr_t hWnd, intptr_t hDC)'),
      GetCurrentThreadId: kernel32.func('uint32_t __stdcall GetCurrentThreadId()'),
      CreateCompatibleDC: gdi32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t hdc)'),
      CreateCompatibleBitmap: gdi32.func('intptr_t __stdcall CreateCompatibleBitmap(intptr_t hdc, int32_t nWidth, int32_t nHeight)'),
      CreateRoundRectRgn: gdi32.func('intptr_t __stdcall CreateRoundRectRgn(int32_t x1, int32_t y1, int32_t x2, int32_t y2, int32_t w, int32_t h)'),
      SelectObject: gdi32.func('intptr_t __stdcall SelectObject(intptr_t hdc, intptr_t hgdiobj)'),
      GetDIBits: gdi32.func(`int32_t __stdcall GetDIBits(intptr_t hdc, intptr_t hbm, uint32_t start, uint32_t cLines, void *lpvBits, const ${bitmapInfoName} *lpbi, uint32_t usage)`),
      DeleteObject: gdi32.func('int8_t __stdcall DeleteObject(intptr_t hObject)'),
      DeleteDC: gdi32.func('int8_t __stdcall DeleteDC(intptr_t hdc)'),
    };
    return bindings;
  } catch (e) {
    bindingsError = new Error(`加载 koffi win32 绑定失败: ${e.message}`);
    throw bindingsError;
  }
};

export const hwndFromWindow = (win) => {
  const buf = win.getNativeWindowHandle();
  if (buf.length >= 8) {
    return Number(buf.readBigUInt64LE(0));
  }
  return buf.readUInt32LE(0);
};

export const findWindowByTitle = (title) => {
  const b = loadBindings();
  const hwnd = b.FindWindowW(null, title);
  return hwnd > 0 ? hwnd : 0;
};

export const getCursorPosInClient = (wrapperWin) => {
  if (!wrapperWin || wrapperWin.isDestroyed()) {
    return null;
  }
  const b = loadBindings();
  const parentHwnd = hwndFromWindow(wrapperWin);
  if (!b.GetCursorPos(b.pointPtr)) {
    return null;
  }
  if (!b.ScreenToClient(parentHwnd, b.pointPtr)) {
    return null;
  }
  return b.decodePoint(b.pointPtr);
};

/**
 * 同步子窗口到客户区物理像素坐标。
 */
export const syncChildRect = (wrapperWin, sdlHwnd, options = {}) => {
  const b = loadBindings();
  const {
    leftOffsetPhysical = 0,
    topOffsetPhysical = 0,
    rightOffsetPhysical = 0,
    bottomOffsetPhysical = 0,
    borderPhysical = 0,
    cornerRadiusCss = 0,
    scaleFactor = 1,
    show = true,
    frameChanged = false,
    aspect = null,
    keepBelow = false,
    onRect = null,
  } = options;
  const parentHwnd = hwndFromWindow(wrapperWin);
  if (!b.GetClientRect(parentHwnd, b.rectPtr)) {
    return;
  }
  const rect = b.decodeRect(b.rectPtr);
  const clientW = rect.right - rect.left;
  const clientH = rect.bottom - rect.top;

  const leftOffset = Math.max(0, Math.round(leftOffsetPhysical));
  const topOffset = Math.max(0, Math.round(topOffsetPhysical));
  const rightOffset = Math.max(0, Math.round(rightOffsetPhysical));
  const bottomOffset = Math.max(0, Math.round(bottomOffsetPhysical));

  const availableW = Math.max(1, clientW - leftOffset - rightOffset);
  const availableH = Math.max(1, clientH - topOffset - bottomOffset);

  const video = fitVideoRect({
    areaWidth: availableW,
    areaHeight: availableH,
    aspect,
  });

  const finalX = leftOffset + video.x;
  const finalY = topOffset + video.y;
  const finalW = video.width;
  const finalH = video.height;

  const flags = SWP_NOACTIVATE
    | (frameChanged ? SWP_FRAMECHANGED : 0)
    | (show ? SWP_SHOWWINDOW : 0);
  b.SetWindowPos(sdlHwnd, keepBelow ? HWND_BOTTOM : HWND_TOP, finalX, finalY, finalW, finalH, flags);

  // 裁切圆角（若 cornerRadiusCss > 0），或置空 region 恢复原生方角
  if (cornerRadiusCss > 0 && finalW > 0 && finalH > 0) {
    const radiusPhysical = Math.max(1, Math.round(cornerRadiusCss * scaleFactor));
    const diameter = radiusPhysical * 2;
    const hrgn = b.CreateRoundRectRgn(0, 0, finalW + 1, finalH + 1, diameter, diameter);
    if (hrgn) {
      b.SetWindowRgn(sdlHwnd, hrgn, 1);
    }
  } else if (finalW > 0 && finalH > 0) {
    b.SetWindowRgn(sdlHwnd, 0, 1);
  }

  if (typeof onRect === 'function' && scaleFactor > 0) {
    onRect({
      x: finalX / scaleFactor,
      y: finalY / scaleFactor,
      width: finalW / scaleFactor,
      height: finalH / scaleFactor,
      border: borderPhysical / scaleFactor,
      radius: cornerRadiusCss,
    });
  }
};

/**
 * 保证 SDL 子窗口处于父窗口最上层。
 */
export const ensureChildOnTop = (wrapperWin, sdlHwnd) => {
  const b = loadBindings();
  const parentHwnd = hwndFromWindow(wrapperWin);
  if (b.GetWindow(parentHwnd, GW_CHILD) === sdlHwnd) {
    return;
  }
  b.SetWindowPos(sdlHwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
};

const delay = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * 跨进程挂载父窗口并校验挂载结果。
 */
const setParentVerified = async (b, sdlHwnd, parentHwnd, attempt = 1) => {
  b.SetParent(sdlHwnd, parentHwnd);
  if (b.GetAncestor(sdlHwnd, GA_ROOT) === parentHwnd) {
    return;
  }
  if (attempt >= 10) {
    throw new Error('scrcpy 画面窗口挂载失败：SetParent 未生效');
  }
  await delay(100);
  await setParentVerified(b, sdlHwnd, parentHwnd, attempt + 1);
};

/**
 * 把 scrcpy 的 SDL 窗口以无边框形式嵌入 Electron wrapper 窗口。
 */
export const mountSdlToElectron = async (wrapperWin, sdlHwnd, options = {}) => {
  const b = loadBindings();
  const parentHwnd = hwndFromWindow(wrapperWin);
  const currentThread = b.GetCurrentThreadId();
  const sdlThread = b.GetWindowThreadProcessId(sdlHwnd, null);
  const attached = b.AttachThreadInput(currentThread, sdlThread, 1);
  try {
    b.SetWindowPos(sdlHwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_HIDEWINDOW);

    await setParentVerified(b, sdlHwnd, parentHwnd);

    const parentStyle = b.GetWindowLongPtrW(parentHwnd, GWL_STYLE);
    b.SetWindowLongPtrW(parentHwnd, GWL_STYLE, Number(BigInt(parentStyle) | WS_CLIPCHILDREN));

    const childStyle = b.GetWindowLongPtrW(sdlHwnd, GWL_STYLE);
    const childNext = Number((BigInt(childStyle) | WS_CHILD | WS_VISIBLE) & ~WS_POPUP & ~NONCLIENT_STYLES);
    b.SetWindowLongPtrW(sdlHwnd, GWL_STYLE, childNext);

    syncChildRect(wrapperWin, sdlHwnd, { ...options, frameChanged: true });
  } finally {
    if (attached) {
      b.AttachThreadInput(currentThread, sdlThread, 0);
    }
  }
};

/**
 * 把 SDL 子窗口压到同层兄弟窗口的最底部（保持可见）。
 */
export const lowerWindowBelowSiblings = (sdlHwnd) => {
  const b = loadBindings();
  b.SetWindowPos(sdlHwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
};

/**
 * 抓取 SDL 画面窗口当前帧的原始 BGRA 像素与尺寸。
 */
export const captureWindowPixels = (sdlHwnd) => {
  const b = loadBindings();
  if (!b.GetClientRect(sdlHwnd, b.rectPtr)) {
    return null;
  }
  const rect = b.decodeRect(b.rectPtr);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const screenDc = b.GetWindowDC(0);
  const memDc = screenDc ? b.CreateCompatibleDC(screenDc) : 0;
  const bitmap = memDc ? b.CreateCompatibleBitmap(screenDc, width, height) : 0;
  try {
    if (!bitmap) {
      return null;
    }
    const previous = b.SelectObject(memDc, bitmap);
    const printed = b.PrintWindow(sdlHwnd, memDc, PW_CLIENTONLY | PW_RENDERFULLCONTENT);
    b.SelectObject(memDc, previous);
    if (!printed) {
      return null;
    }
    const buffer = Buffer.allocUnsafe(width * height * 4);
    const lines = b.GetDIBits(memDc, bitmap, 0, height, buffer, {
      biSize: b.bitmapInfoSize,
      biWidth: width,
      biHeight: -height,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: 0,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    }, 0);
    if (lines !== height) {
      return null;
    }
    return { buffer, width, height };
  } finally {
    if (bitmap) {
      b.DeleteObject(bitmap);
    }
    if (memDc) {
      b.DeleteDC(memDc);
    }
    if (screenDc) {
      b.ReleaseDC(0, screenDc);
    }
  }
};

/** 把 captureWindowPixels 的结果编码为可直接用于 <img> 的 dataURL */
export const windowPixelsToDataUrl = ({ buffer, width, height }) => nativeImage
  .createFromBitmap(buffer, { width, height })
  .toDataURL({ format: 'jpeg', quality: 80 });

/**
 * 缩放实时同步与布局调度。
 */
export const setupResizeSync = (wrapperWin, sdlHwnd, options = {}) => {
  const {
    getLeftOffsetPhysical = () => 0,
    getTopOffsetPhysical = () => 0,
    getRightOffsetPhysical = () => 0,
    getBottomOffsetPhysical = () => 0,
    getBorderPhysical = () => 0,
    getCornerRadiusCss = () => 0,
    getScaleFactor = () => 1,
    getAspect = () => null,
    isFrozen = () => false,
    debounceMs = 120,
    onResizeBurstStart = null,
    onResizeSettled = null,
    onRect = null,
  } = options;

  const sync = () => {
    syncChildRect(wrapperWin, sdlHwnd, {
      leftOffsetPhysical: getLeftOffsetPhysical(),
      topOffsetPhysical: getTopOffsetPhysical(),
      rightOffsetPhysical: getRightOffsetPhysical(),
      bottomOffsetPhysical: getBottomOffsetPhysical(),
      borderPhysical: getBorderPhysical(),
      cornerRadiusCss: getCornerRadiusCss(),
      scaleFactor: getScaleFactor(),
      aspect: getAspect(),
      show: true,
      keepBelow: isFrozen(),
      onRect,
    });
  };

  const scheduler = createResizeScheduler({
    debounceMs,
    onBurstStart: () => onResizeBurstStart?.(),
    onSettle: () => {
      sync();
      onResizeSettled?.();
    },
  });

  const schedule = () => scheduler.notifyResize();
  const settleNow = () => scheduler.settle();
  wrapperWin.on('resize', schedule);
  wrapperWin.on('will-resize', schedule);
  wrapperWin.on('resized', settleNow);
  wrapperWin.hookWindowMessage(WM_EXITSIZEMOVE, settleNow);
  const zOrderTimer = setInterval(() => {
    if (isFrozen()) {
      return;
    }
    try {
      ensureChildOnTop(wrapperWin, sdlHwnd);
    } catch {
      // 窗口可能已销毁，destroy 时统一清理定时器
    }
  }, 500);

  return {
    syncNow: sync,
    destroy() {
      scheduler.dispose();
      clearInterval(zOrderTimer);
      try {
        wrapperWin.unhookWindowMessage(WM_EXITSIZEMOVE);
      } catch {
        // 窗口可能已销毁
      }
      wrapperWin.removeListener('resize', schedule);
      wrapperWin.removeListener('will-resize', schedule);
      wrapperWin.removeListener('resized', settleNow);
    },
  };
};
