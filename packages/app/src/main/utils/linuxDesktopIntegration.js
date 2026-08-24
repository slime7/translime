import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import iconBase64 from '@pkg/share/static/icon.png';
import logger from './logger';

export const setupLinuxDesktopIntegration = () => {
  if (process.platform !== 'linux') {
    return;
  }

  try {
    const homeDir = os.homedir();
    if (!homeDir) {
      return;
    }

    const iconsDir = path.join(homeDir, '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
    const appsDir = path.join(homeDir, '.local', 'share', 'applications');

    fs.mkdirSync(iconsDir, { recursive: true });
    fs.mkdirSync(appsDir, { recursive: true });

    const iconPath = path.join(iconsDir, 'translime.png');
    if (!fs.existsSync(iconPath)) {
      const base64Data = iconBase64.includes(',') ? iconBase64.split(',')[1] : iconBase64;
      fs.writeFileSync(iconPath, Buffer.from(base64Data, 'base64'));
    }

    const desktopPath = path.join(appsDir, 'translime.desktop');
    if (!fs.existsSync(desktopPath)) {
      const { execPath } = process;
      const desktopContent = `[Desktop Entry]
Name=translime
Exec="${execPath}" %U
Icon=translime
Type=Application
StartupWMClass=translime
Categories=Utility;
Comment=translime
`;
      fs.writeFileSync(desktopPath, desktopContent, 'utf8');
    }
  } catch (err) {
    logger.warn('Linux desktop icon integration failed:', err);
  }
};

export default setupLinuxDesktopIntegration;
