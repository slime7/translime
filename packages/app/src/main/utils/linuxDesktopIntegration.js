import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { app } from 'electron';
import iconBase64 from '@pkg/share/static/icon.png';
import logger from './logger';

/**
 * 获取 Linux XDG 应用程序目录路径。
 *
 * @returns {string} 应用程序快捷方式目录。
 */
export const getLinuxAppsDir = () => {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'applications');
};

/**
 * 获取 Linux XDG 图标目录路径。
 *
 * @returns {string} 图标安装目录。
 */
export const getLinuxIconsDir = () => {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'icons', 'hicolor', '256x256', 'apps');
};

/**
 * 获取 Linux 桌面目录路径。
 *
 * @returns {string} 桌面目录。
 */
export const getLinuxDesktopDir = () => {
  try {
    if (typeof app?.getPath === 'function') {
      const desktopPath = app.getPath('desktop');
      if (desktopPath) {
        return desktopPath;
      }
    }
  } catch {
    // 忽略异常，降级到配置文件或标准路径
  }

  const homeDir = os.homedir();
  try {
    const userDirsFile = path.join(homeDir, '.config', 'user-dirs.dirs');
    if (fs.existsSync(userDirsFile)) {
      const content = fs.readFileSync(userDirsFile, 'utf8');
      const match = content.match(/XDG_DESKTOP_DIR="([^"]+)"/);
      if (match && match[1]) {
        return match[1].replace('$HOME', homeDir);
      }
    }
  } catch {
    // 忽略读取错误
  }

  return path.join(homeDir, 'Desktop');
};

/**
 * 获取当前应用程序可执行文件路径。
 *
 * 优先检测 AppImage 环境变量（保证 AppImage 独立运行包迁移或重命名后指向真实文件），
 * 其次优先尝试 Electron 的 app.getPath('exe')，最后回退至 process.execPath。
 *
 * @returns {string} 应用程序执行文件路径。
 */
export const getExecutablePath = () => {
  if (process.env.APPIMAGE) {
    return process.env.APPIMAGE;
  }
  try {
    if (typeof app?.getPath === 'function') {
      const exe = app.getPath('exe');
      if (exe) {
        return exe;
      }
    }
  } catch {
    // 忽略异常
  }
  return process.execPath;
};

/**
 * 生成 Linux .desktop 文件内容。
 *
 * @param {string} [execPath] - 执行文件路径。
 * @returns {string} .desktop 文件文本。
 */
export const generateDesktopEntryContent = (execPath) => {
  const binaryPath = execPath || getExecutablePath();
  return `[Desktop Entry]
Name=translime
Exec="${binaryPath}" %U
Icon=translime
Type=Application
StartupWMClass=translime
Categories=Utility;
Comment=translime
Terminal=false
`;
};

/**
 * 确保应用程序图标已写入指定图标目录。
 *
 * @param {string} iconsDir - 图标目录。
 * @returns {string} 写入的图标文件绝对路径。
 */
export const ensureLinuxIconInstalled = (iconsDir) => {
  fs.mkdirSync(iconsDir, { recursive: true });
  const iconPath = path.join(iconsDir, 'translime.png');
  const base64Data = iconBase64.includes(',') ? iconBase64.split(',')[1] : iconBase64;
  fs.writeFileSync(iconPath, Buffer.from(base64Data, 'base64'));
  return iconPath;
};

/**
 * 为 Linux 平台创建桌面与开始菜单快捷方式。
 *
 * 手动触发时更新快捷方式中的目标路径。
 *
 * @param {string} [customExecPath] - 自定义执行文件路径（可选，缺省时自动解析）。
 * @returns {{ success: boolean, error?: string, desktopPath?: string, menuPath?: string }} 创建结果。
 */
export const createLinuxDesktopShortcuts = (customExecPath) => {
  if (process.platform !== 'linux') {
    return {
      success: false,
      error: '当前环境不是 Linux 平台',
    };
  }

  try {
    const homeDir = os.homedir();
    if (!homeDir) {
      return {
        success: false,
        error: '无法获取用户主目录',
      };
    }

    const iconsDir = getLinuxIconsDir();
    const appsDir = getLinuxAppsDir();
    const desktopDir = getLinuxDesktopDir();

    fs.mkdirSync(iconsDir, { recursive: true });
    fs.mkdirSync(appsDir, { recursive: true });
    fs.mkdirSync(desktopDir, { recursive: true });

    ensureLinuxIconInstalled(iconsDir);

    const desktopContent = generateDesktopEntryContent(customExecPath);

    // 1. 开始菜单快捷方式 (applications)
    const menuPath = path.join(appsDir, 'translime.desktop');
    fs.writeFileSync(menuPath, desktopContent, 'utf8');
    try {
      fs.chmodSync(menuPath, 0o755);
    } catch {
      // 忽略 chmod 异常
    }

    // 2. 桌面快捷方式 (desktop)
    const desktopPath = path.join(desktopDir, 'translime.desktop');
    fs.writeFileSync(desktopPath, desktopContent, { encoding: 'utf8', mode: 0o755 });
    try {
      fs.chmodSync(desktopPath, 0o755);
    } catch (chmodErr) {
      logger.warn('Failed to chmod desktop shortcut:', chmodErr);
    }

    // 尝试更新 mtime，触发桌面环境 inotify 刷新
    try {
      const now = new Date();
      fs.utimesSync(desktopPath, now, now);
      fs.utimesSync(menuPath, now, now);
    } catch {
      // 忽略 utimes 异常
    }

    // 尝试在支持 gio 的环境中标记信任
    try {
      execSync(`gio set "${desktopPath}" metadata::trusted true`, { stdio: 'ignore' });
    } catch {
      // 忽略 gio 命令缺失或非 GNOME 环境异常
    }

    // 尝试刷新应用程序桌面数据库缓存
    try {
      execSync(`update-desktop-database "${appsDir}"`, { stdio: 'ignore' });
    } catch {
      // 忽略 update-desktop-database 缺失或执行异常
    }

    return {
      success: true,
      desktopPath,
      menuPath,
    };
  } catch (err) {
    logger.warn('Failed to create Linux desktop shortcuts:', err);
    return {
      success: false,
      error: err.message || '创建快捷方式失败',
    };
  }
};

/**
 * 应用启动时初始化 Linux 桌面整合（仅在文件未存在时初始化图标与开始菜单项）。
 *
 * @returns {void}
 */
export const setupLinuxDesktopIntegration = () => {
  if (process.platform !== 'linux') {
    return;
  }

  try {
    const homeDir = os.homedir();
    if (!homeDir) {
      return;
    }

    const iconsDir = getLinuxIconsDir();
    const appsDir = getLinuxAppsDir();

    fs.mkdirSync(iconsDir, { recursive: true });
    fs.mkdirSync(appsDir, { recursive: true });

    const iconPath = path.join(iconsDir, 'translime.png');
    if (!fs.existsSync(iconPath)) {
      ensureLinuxIconInstalled(iconsDir);
    }

    const desktopPath = path.join(appsDir, 'translime.desktop');
    if (!fs.existsSync(desktopPath)) {
      const desktopContent = generateDesktopEntryContent();
      fs.writeFileSync(desktopPath, desktopContent, 'utf8');
    }
  } catch (err) {
    logger.warn('Linux desktop icon integration failed:', err);
  }
};

export default setupLinuxDesktopIntegration;
