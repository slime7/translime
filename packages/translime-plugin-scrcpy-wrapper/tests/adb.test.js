import { describe, expect, it } from 'vitest';
import {
  isLauncherPackage,
  parseDisplayResolution,
  parseForegroundPackage,
  parseWakefulness,
} from '../src/adb';

describe('parseDisplayResolution', () => {
  it('优先从 mCurrentDisplayRect 解析当前实际显示分辨率（防止横屏模式被当作竖屏）', () => {
    const sample = `
      mCurrentDisplayRect=Rect(0, 0 - 3000, 2120)
      DisplayDeviceInfo: 2120 x 3000
    `;
    expect(parseDisplayResolution(sample)).toEqual({ width: 3000, height: 2120 });
  });

  it('从 cur= 解析当前旋转后的窗口系统宽高（防止旋转90度后画面被压缩）', () => {
    const sample = 'init=2120x3000 cur=3000x2120 app=3000x2120';
    expect(parseDisplayResolution(sample)).toEqual({ width: 3000, height: 2120 });
  });

  it('根据 init 物理尺寸与 mCurrentRotation=ROTATION_90 自动对调宽高（防止旧版输出漏选横屏）', () => {
    const sample = 'init=2120x3000\nmCurrentRotation=ROTATION_90';
    expect(parseDisplayResolution(sample)).toEqual({ width: 3000, height: 2120 });
  });

  it('竖屏状态 ROTATION_0 保持原宽高不交换', () => {
    const sample = 'init=1080x2400\nmCurrentRotation=ROTATION_0';
    expect(parseDisplayResolution(sample)).toEqual({ width: 1080, height: 2400 });
  });

  it('无法匹配时安全返回 null（防止异常字符串抛错）', () => {
    expect(parseDisplayResolution('')).toBeNull();
    expect(parseDisplayResolution(null)).toBeNull();
  });
});

describe('parseForegroundPackage', () => {
  it('正确提取 dumpsys activity activities 中的 ResumedActivity 包名（防止启动虚拟窗口时无法命中当前应用）', () => {
    const sample = `
      Display #0 (activities from top to bottom):
      ResumedActivity: ActivityRecord{5264b9d u0 com.android.settings/.Settings$NetworkDashboardActivity t1}
      mResumedActivity: ActivityRecord{5264b9d u0 com.android.settings/.Settings$NetworkDashboardActivity t1}
    `;
    expect(parseForegroundPackage(sample)).toBe('com.android.settings');
  });

  it('兼容 topResumedActivity 字段格式（防止新版 Android 格式差异导致解析失败）', () => {
    const sample = 'topResumedActivity=ActivityRecord{9b47e51 u0 com.tencent.mm/.ui.LauncherUI t123}';
    expect(parseForegroundPackage(sample)).toBe('com.tencent.mm');
  });

  it('无 ResumedActivity 时回退解析 mCurrentFocus（防止桌面或浮窗模式下返回空包名）', () => {
    const sample = 'mCurrentFocus=Window{c18da25 u0 com.google.android.youtube/com.google.android.youtube.HomeActivity}';
    expect(parseForegroundPackage(sample)).toBe('com.google.android.youtube');
  });

  it('无匹配内容时安全返回 null（防止异常字符串抛出崩溃）', () => {
    expect(parseForegroundPackage('')).toBeNull();
    expect(parseForegroundPackage(null)).toBeNull();
    expect(parseForegroundPackage('no activity running')).toBeNull();
  });
});

describe('parseWakefulness', () => {
  it('正确解析 dumpsys power 的 mWakefulness 状态（防止电源键判断反转）', () => {
    expect(parseWakefulness('mWakefulness=Awake\r\nmWakefulnessChanging=false')).toBe('awake');
    expect(parseWakefulness('mWakefulness=Asleep')).toBe('asleep');
    expect(parseWakefulness('mWakefulness=Dozing')).toBe('dozing');
  });

  it('未找到状态时安全返回 null（防止错误下发休眠键）', () => {
    expect(parseWakefulness('')).toBeNull();
    expect(parseWakefulness(null)).toBeNull();
    expect(parseWakefulness('Power Manager State: invalid')).toBeNull();
  });
});

describe('isLauncherPackage', () => {
  it('正确识别各主流厂商桌面启动器包名（防止在桌面误识别为前台应用）', () => {
    expect(isLauncherPackage('com.android.launcher3')).toBe(true);
    expect(isLauncherPackage('com.google.android.apps.nexuslauncher')).toBe(true);
    expect(isLauncherPackage('com.miui.home')).toBe(true);
    expect(isLauncherPackage('com.oppo.launcher')).toBe(true);
    expect(isLauncherPackage('com.coloros.launcher')).toBe(true);
    expect(isLauncherPackage('com.android.launcher3.uioverrides.QuickstepLauncher')).toBe(true);
  });

  it('指定 defaultLauncher 时命中该启动器', () => {
    expect(isLauncherPackage('com.custom.desktop', 'com.custom.desktop')).toBe(true);
  });

  it('普通应用包名不被误判为启动器（防止正常应用按钮被禁用）', () => {
    expect(isLauncherPackage('com.tencent.mm')).toBe(false);
    expect(isLauncherPackage('app.alextran.immich')).toBe(false);
    expect(isLauncherPackage('com.bilibili.app.in')).toBe(false);
  });

  it('空值安全判定为启动器（无有效前台应用）', () => {
    expect(isLauncherPackage('')).toBe(true);
    expect(isLauncherPackage(null)).toBe(true);
  });
});
