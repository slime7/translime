import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

const INFO_ENTRY = 'info.json';

/**
 * 将备份目录打包为 zip，本地备份保持目录形态不变。
 * `excludeInfo` 用于分离 info.json，支持直接读取元数据。
 */
export const createArchive = async (dir, zipPath, { excludeInfo = false } = {}) => {
  const zip = new AdmZip();
  const walk = async (current, rel) => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath, entryRel);
        return;
      }
      if (excludeInfo && entryRel === INFO_ENTRY) {
        return;
      }
      zip.addFile(entryRel, await fs.readFile(entryPath));
    }));
  };
  await walk(dir, '');
  await zip.writeZipPromise(zipPath);
};

/**
 * 解压备份 zip 到目标目录，info.json 独立写入；缺 info.json 视为传输未完成状态。
 */
export const extractArchive = async (zipPath, destDir) => {
  const zip = new AdmZip(zipPath);
  await fs.mkdir(destDir, { recursive: true });
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  await Promise.all(entries
    .filter((entry) => entry.entryName !== INFO_ENTRY)
    .map(async (entry) => {
      const dest = path.join(destDir, entry.entryName);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, entry.getData());
    }));
  const infoEntry = zip.getEntry(INFO_ENTRY);
  if (infoEntry) {
    await fs.writeFile(path.join(destDir, INFO_ENTRY), infoEntry.getData());
  }
};
