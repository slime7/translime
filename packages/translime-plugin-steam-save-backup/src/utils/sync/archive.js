import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

const INFO_ENTRY = 'info.json';

/**
 * 将目录打包为 zip 压缩包，支持通过 exclude 排除指定相对路径。
 */
export const createArchive = async (dir, zipPath, { exclude } = {}) => {
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
      if (exclude && exclude(entryRel)) {
        return;
      }
      zip.addFile(entryRel, await fs.readFile(entryPath));
    }));
  };
  await walk(dir, '');
  await zip.writeZipPromise(zipPath);
};

/**
 * 解压 zip 到目标目录，支持 skip 过滤与设置文件修改时间 stampMtime。
 * @returns {Promise<number>} 实际写入的文件数
 */
export const extractArchive = async (zipPath, destDir, { skip, stampMtime } = {}) => {
  const zip = new AdmZip(zipPath);
  await fs.mkdir(destDir, { recursive: true });
  const entries = zip.getEntries()
    .filter((entry) => !entry.isDirectory)
    .filter((entry) => !(skip && skip(entry.entryName)));
  const writeFile = async (entry) => {
    const dest = path.join(destDir, entry.entryName);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.getData());
    if (stampMtime) {
      await fs.utimes(dest, stampMtime, stampMtime);
    }
  };
  await Promise.all(entries
    .filter((entry) => entry.entryName !== INFO_ENTRY)
    .map(writeFile));
  await Promise.all(entries
    .filter((entry) => entry.entryName === INFO_ENTRY)
    .map(writeFile));
  return entries.length;
};
