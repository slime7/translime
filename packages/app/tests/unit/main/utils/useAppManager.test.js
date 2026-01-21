import {
  beforeEach, describe, expect, it,
} from 'vitest';
import appManager from '@main/utils/useAppManager';

describe('useAppManager', () => {
  beforeEach(() => {
    // Reset state manually if possible or just be careful.
    // The implementation exposes `state` object.
    if (appManager.state) {
      appManager.state.win = null;
      appManager.state.launchWin = null;
      appManager.state.childWins = {};
      appManager.state.ipc = null;
      appManager.state.pluginLoader = null;
      appManager.state.tray = null;
      appManager.state.mainProcessLock = null;
    }
  });

  it('应该能设置和获取 MainWindow', () => {
    const mockWin = { id: 1 };
    appManager.setWin(mockWin);
    expect(appManager.getWin()).toBe(mockWin);
  });

  it('应该能设置和获取 LaunchWindow', () => {
    const mockWin = { id: 2 };
    appManager.setLaunchWin(mockWin);
    expect(appManager.getLaunchWin()).toBe(mockWin);
  });

  it('应该能管理 ChildWindows', () => {
    const mockWinA = { id: 3 };
    const mockWinB = { id: 4 };

    appManager.setChildWin('winA', mockWinA);
    appManager.setChildWin('winB', mockWinB);

    expect(appManager.getChildWin('winA')).toBe(mockWinA);
    expect(appManager.getChildWin('winB')).toBe(mockWinB);

    // Get all
    expect(appManager.getChildWin()).toEqual({
      winA: mockWinA,
      winB: mockWinB,
    });

    // Remove
    appManager.removeChildWin('winA');
    expect(appManager.getChildWin('winA')).toBeUndefined();
    expect(appManager.getChildWin('winB')).toBe(mockWinB);
  });

  it('应该能设置 IPC 实例', () => {
    const mockIpc = { send: () => {} };
    appManager.setIpc(mockIpc);
    expect(appManager.getIpc()).toBe(mockIpc);
  });

  it('应该能设置 PluginLoader', () => {
    const mockLoader = { load: () => {} };
    appManager.setPluginLoader(mockLoader);
    expect(appManager.getPluginLoader()).toBe(mockLoader);
  });

  it('应该能设置 Tray', () => {
    const mockTray = { destroy: () => {} };
    appManager.setTray(mockTray);
    expect(appManager.getTray()).toBe(mockTray);
  });
});
