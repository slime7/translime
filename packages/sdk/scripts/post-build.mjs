import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const copyFile = (src, dest) => {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log(`Copied ${src} to ${dest}`);
};

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const srcDir = path.resolve(rootDir, 'src');

// Copy preview-template.html
const templateSrc = path.resolve(rootDir, 'preview-template.html');
const templateDest = path.resolve(distDir, 'preview-template.html');
if (fs.existsSync(templateSrc)) {
  copyFile(templateSrc, templateDest);
}

// Copy settings.scss
const settingsSrc = path.resolve(srcDir, 'preview/settings.scss');
const settingsDest = path.resolve(distDir, 'preview/settings.scss');
if (fs.existsSync(settingsSrc)) {
  copyFile(settingsSrc, settingsDest);
}

// Copy .d.ts files
const copyDts = (dir) => {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      copyDts(filePath);
    } else if (file.endsWith('.d.ts')) {
      const relPath = path.relative(srcDir, filePath);
      const destPath = path.join(distDir, relPath);
      copyFile(filePath, destPath);

      // Also create .d.cts copy for CJS
      const destCtsPath = destPath.replace(/\.d\.ts$/, '.d.cts');
      copyFile(filePath, destCtsPath);
    }
  });
};

copyDts(srcDir);
