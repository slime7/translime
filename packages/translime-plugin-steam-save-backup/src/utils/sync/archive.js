import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';

const INFO_ENTRY = 'info.json';

/**
 * 将备份目录打包为 zip。
 * 备份数量多的游戏逐文件同步会在 SMB / 云盘上付出大量往返延迟，
 * 打包后每次备份只传输单个文件；本地备份保持目录形态不变。
 * `excludeInfo` 用于远端数据包：info.json 与数据包分开存放，便于不解包直接读取元数据。
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
 * 解压备份 zip 到目标目录；info.json 最后写入——
 * 与目录格式一致，缺 info.json 的目录即传输中断残留，下次对账自动修复。
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
