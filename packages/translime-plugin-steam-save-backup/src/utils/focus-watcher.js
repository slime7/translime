import { app, BrowserWindow } from 'electron';
import { createFocusStateResolver } from './focus-state';

/**
 * 宿主窗口焦点监控（跨平台）：
 * 任一宿主窗口持有焦点视为「在焦点」，监听 app 的 browser-window-focus /
 * browser-window-blur 事件驱动状态刷新；宿主无焦点窗口（最小化/托盘/全部
 * 关闭）与失焦同等对待。焦点抖动经 focus-state 防抖确认后才回调
 * onFocusChange，由外部映射为存档监控的暂停/恢复。
 */
const createFocusWatcher = ({ settleMs, onFocusChange = () => {} } = {}) => {
  let resolver = null;

  const isHostFocused = () => BrowserWindow.getAllWindows().some((win) => win.isFocused());

  const sync = () => {
    if (resolver) {
      resolver.apply(isHostFocused());
    }
  };

  return {
    start() {
      if (resolver) {
        return;
      }
      const focused = isHostFocused();
      resolver = createFocusStateResolver({ initialState: focused, settleMs, onChange: onFocusChange });
      if (!focused) {
        // 启动即无焦点窗口（开机自启/最小化到托盘）：监控直接进入挂起
        onFocusChange(false);
      }
      app.on('browser-window-focus', sync);
      app.on('browser-window-blur', sync);
    },
    stop() {
      if (!resolver) {
        return;
      }
      app.removeListener('browser-window-focus', sync);
      app.removeListener('browser-window-blur', sync);
      resolver.cancel();
      resolver = null;
    },
  };
};

export default createFocusWatcher;
