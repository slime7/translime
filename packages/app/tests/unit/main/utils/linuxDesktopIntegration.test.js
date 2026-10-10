import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import path from 'node:path';
import {
  createLinuxDesktopShortcuts,
  generateDesktopEntryContent,
  getExecutablePath,
  setupLinuxDesktopIntegration,
} from '@main/utils/linuxDesktopIntegration';

const { mockFs, mockApp } = vi.hoisted(() => ({
  mockFs: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    readFileSync: vi.fn(),
    utimesSync: vi.fn(),
  },
  mockApp: {
    getPath: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('electron', () => ({
  app: mockApp,
}));

vi.mock('@main/utils/logger', () => ({
  default: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('linuxDesktopIntegration', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.APPIMAGE;
  });

  describe('getExecutablePath', () => {
    it('优先返回 process.env.APPIMAGE 环境变量', () => {
      process.env.APPIMAGE = '/home/user/apps/translime-v2.AppImage';
      mockApp.getPath.mockReturnValue('/tmp/.mount_translime/translime');

      const exe = getExecutablePath();
      expect(exe).toBe('/home/user/apps/translime-v2.AppImage');

      delete process.env.APPIMAGE;
    });

    it('无 APPIMAGE 时优先使用 app.getPath("exe")', () => {
      mockApp.getPath.mockReturnValue('/opt/translime/custom-translime');

      const exe = getExecutablePath();
      expect(exe).toBe('/opt/translime/custom-translime');
    });
  });

  describe('generateDesktopEntryContent', () => {
    it('生成包含 Utility 分类和必要属性的 .desktop 内容', () => {
      const content = generateDesktopEntryContent('/opt/translime/translime');

      expect(content).toContain('[Desktop Entry]');
      expect(content).toContain('Name=translime');
      expect(content).toContain('Exec="/opt/translime/translime" %U');
      expect(content).toContain('Icon=translime');
      expect(content).toContain('Type=Application');
      expect(content).toContain('StartupWMClass=translime');
      expect(content).toContain('Categories=Utility;');
      expect(content).toContain('Terminal=false');
    });
  });

  describe('createLinuxDesktopShortcuts', () => {
    it('在非 Linux 平台调用应返回失败且不创建文件', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      const result = createLinuxDesktopShortcuts();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Linux');
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('在 Linux 平台调用应创建桌面和开始菜单快捷方式并设置权限', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockApp.getPath.mockReturnValue('/home/testuser/Desktop');

      const result = createLinuxDesktopShortcuts();

      expect(result.success).toBe(true);
      expect(result.desktopPath).toBe(path.join('/home/testuser/Desktop', 'translime.desktop'));
      expect(result.menuPath).toContain('translime.desktop');
      expect(mockFs.mkdirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(3);
      expect(mockFs.chmodSync).toHaveBeenCalledWith(
        path.join('/home/testuser/Desktop', 'translime.desktop'),
        0o755,
      );

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('手动调用时应根据当前最新路径覆写更新快捷方式内容', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockApp.getPath.mockImplementation((name) => {
        if (name === 'desktop') {
          return '/home/testuser/Desktop';
        }
        if (name === 'exe') {
          return '/home/testuser/new-folder/renamed-translime';
        }
        return '';
      });

      const writtenContents = [];
      mockFs.writeFileSync.mockImplementation((filePath, data) => {
        writtenContents.push({ filePath, data: String(data) });
      });

      const result = createLinuxDesktopShortcuts();

      expect(result.success).toBe(true);
      const desktopWrite = writtenContents.find((item) => (
        item.filePath.replace(/\\/g, '/').includes('/Desktop/translime.desktop')
      ));
      const menuWrite = writtenContents.find((item) => (
        item.filePath.replace(/\\/g, '/').includes('/applications/translime.desktop')
      ));

      expect(desktopWrite).toBeDefined();
      expect(menuWrite).toBeDefined();
      expect(desktopWrite.data).toContain('Exec="/home/testuser/new-folder/renamed-translime" %U');
      expect(menuWrite.data).toContain('Exec="/home/testuser/new-folder/renamed-translime" %U');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('文件写入异常时应捕获并返回错误信息', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockApp.getPath.mockReturnValue('/home/testuser/Desktop');
      mockFs.mkdirSync.mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = createLinuxDesktopShortcuts();

      expect(result.success).toBe(false);
      expect(result.error).toContain('EACCES');

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('setupLinuxDesktopIntegration', () => {
    it('在非 Linux 平台调用应直接返回', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      setupLinuxDesktopIntegration();

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('在 Linux 平台如果快捷方式已存在时不自动覆写更新', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockFs.existsSync.mockReturnValue(true);

      setupLinuxDesktopIntegration();

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('在 Linux 平台如果快捷方式不存在时执行初始化创建', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      mockFs.existsSync.mockReturnValue(false);

      setupLinuxDesktopIntegration();

      expect(mockFs.mkdirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled();

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });
});
