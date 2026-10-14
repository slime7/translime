import { createRequire } from 'node:module';

const requireNative = createRequire(import.meta.url);

export const GWL_STYLE = -16;
export const WM_ENTERSIZEMOVE = 0x0231;
export const WM_EXITSIZEMOVE = 0x0232;

// 窗口样式值含第 31 位（WS_POPUP），超出 JS 32 位位运算范围，必须经 BigInt 参与运算
const WS_VISIBLE = 0x10000000n;
const WS_CLIPCHILDREN = 0x02000000n;
const WS_CHILD = 0x40000000n;
const WS_POPUP = 0x80000000n;

const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SWP_SHOWWINDOW = 0x0040;
const SWP_HIDEWINDOW = 0x0080;

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
    // 用随机后缀避免 RECT 结构体重名冲突
    const rectName = `scrcpy_wrapper_rect_${Math.random().toString(36).slice(2)}`;
    const RECT = koffi.struct(rectName, {
      left: 'int32_t',
      top: 'int32_t',
      right: 'int32_t',
      bottom: 'int32_t',
    });
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const gdi32 = koffi.load('gdi32.dll');
    bindings = {
      RECT,
      FindWindowW: user32.func('intptr_t __stdcall FindWindowW(const str16 lpClassName, const str16 lpWindowName)'),
      SetParent: user32.func('intptr_t __stdcall SetParent(intptr_t hWndChild, intptr_t hWndNewParent)'),
      GetWindowLongPtrW: user32.func('uintptr_t __stdcall GetWindowLongPtrW(intptr_t hWnd, int32_t nIndex)'),
      SetWindowLongPtrW: user32.func('uintptr_t __stdcall SetWindowLongPtrW(intptr_t hWnd, int32_t nIndex, uintptr_t dwNewLong)'),
      SetWindowPos: user32.func('int8_t __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int32_t X, int32_t Y, int32_t cx, int32_t cy, uint32_t uFlags)'),
      AttachThreadInput: user32.func('int8_t __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, int8_t fAttach)'),
      GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, uint32_t *lpdwProcessId)'),
      GetClientRect: user32.func(`int8_t __stdcall GetClientRect(intptr_t hWnd, ${rectName} *lpRect)`),
      PrintWindow: user32.func('int8_t __stdcall PrintWindow(intptr_t hWnd, intptr_t hdcBlt, uint32_t nFlags)'),
      GetWindowDC: user32.func('intptr_t __stdcall GetWindowDC(intptr_t hWnd)'),
      ReleaseDC: user32.func('int32_t __stdcall ReleaseDC(intptr_t hWnd, intptr_t hDC)'),
      GetCurrentThreadId: kernel32.func('uint32_t __stdcall GetCurrentThreadId()'),
      CreateCompatibleDC: gdi32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t hdc)'),
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

/**
 * 按客户区（减去底部控制条）同步子窗口位置，物理像素坐标
 */
export const syncChildRect = (wrapperWin, sdlHwnd, options = {}) => {
  const b = loadBindings();
  const { barPhysicalHeight = 0, show = true } = options;
  const parentHwnd = hwndFromWindow(wrapperWin);
  const rect = new b.RECT();
  if (!b.GetClientRect(parentHwnd, rect)) {
    return;
  }
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top - Math.max(0, Math.round(barPhysicalHeight));
  const flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | (show ? SWP_SHOWWINDOW : 0);
  b.SetWindowPos(sdlHwnd, 0, 0, 0, width, Math.max(1, height), flags);
};

/**
 * 把 scrcpy 的 SDL 窗口嵌入 Electron wrapper 窗口：
 * 父窗口开 WS_CLIPCHILDREN，子窗口转 WS_CHILD 并去 WS_POPUP，
 * 跨进程挂接输入线程完成后立即解绑
 */
export const mountSdlToElectron = (wrapperWin, sdlHwnd, options = {}) => {
  const b = loadBindings();
  const parentHwnd = hwndFromWindow(wrapperWin);
  const currentThread = b.GetCurrentThreadId();
  const sdlThread = b.GetWindowThreadProcessId(sdlHwnd, null);
  const attached = b.AttachThreadInput(currentThread, sdlThread, 1);
  try {
    const parentStyle = b.GetWindowLongPtrW(parentHwnd, GWL_STYLE);
    b.SetWindowLongPtrW(parentHwnd, GWL_STYLE, Number(BigInt(parentStyle) | WS_CLIPCHILDREN));

    const childStyle = b.GetWindowLongPtrW(sdlHwnd, GWL_STYLE);
    const childNext = Number((BigInt(childStyle) | WS_CHILD | WS_VISIBLE) & ~WS_POPUP);
    b.SetWindowLongPtrW(sdlHwnd, GWL_STYLE, childNext);

    b.SetParent(sdlHwnd, parentHwnd);
    syncChildRect(wrapperWin, sdlHwnd, options);
  } finally {
    if (attached) {
      b.AttachThreadInput(currentThread, sdlThread, 0);
    }
  }
};

/**
 * 拦截宿主窗口的模态拖动/缩放循环：
 * 进入时隐藏子窗口避免逐帧残影，退出后单次 SetWindowPos 落地
 */
export const setupBlurResizeHooks = (wrapperWin, sdlHwnd, options = {}) => {
  const { getBarPhysicalHeight = () => 0 } = options;
  let resizing = false;

  const hideChild = () => {
    const b = loadBindings();
    b.SetWindowPos(
      sdlHwnd,
      0,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_HIDEWINDOW,
    );
  };
  const showChild = () => {
    syncChildRect(wrapperWin, sdlHwnd, { barPhysicalHeight: getBarPhysicalHeight(), show: true });
  };
  const onEnterSizeMove = () => {
    resizing = true;
    hideChild();
  };
  const onExitSizeMove = () => {
    resizing = false;
    showChild();
  };
  const onResize = () => {
    if (resizing) {
      return;
    }
    showChild();
  };

  wrapperWin.hookWindowMessage(WM_ENTERSIZEMOVE, onEnterSizeMove);
  wrapperWin.hookWindowMessage(WM_EXITSIZEMOVE, onExitSizeMove);
  wrapperWin.on('resize', onResize);

  return {
    destroy() {
      try {
        wrapperWin.unhookWindowMessage(WM_ENTERSIZEMOVE);
      } catch {
        // 窗口可能已销毁
      }
      try {
        wrapperWin.unhookWindowMessage(WM_EXITSIZEMOVE);
      } catch {
        // 同上
      }
      wrapperWin.removeListener('resize', onResize);
    },
  };
};
