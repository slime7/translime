import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 基于磁盘的模拟 rclone（直通同步测试专用）：实现 copy（含 staging 的 --include 拉取，
 * 目标目录取自调用参数）、copyto、moveto、lsf、purge。--update 不在直通路径
 * （条目级快照取代文件级增量）。
 *
 * 把 rclone 远端风格路径（remote:path/x）映射到磁盘上的模拟远端根的父目录：
 * 引擎会在 target 后自行拼接 passthrough/<entryId>，因此 target 对应 remoteRoot 的上一级。
 *
 * @param {object} options
 * @param {string} options.target 远程目标（如 'fake-remote:saves'）
 * @param {string} options.remoteRoot 模拟远端的 passthrough 根目录
 */
export const createPassthroughFakeExec = ({ target, remoteRoot }) => {
  const REMOTE_PREFIX = target;
  const toPath = (p) => {
    const norm = String(p).replaceAll('\\', '/');
    if (norm === REMOTE_PREFIX || norm.startsWith(`${REMOTE_PREFIX}/`)) {
      const rel = norm.slice(REMOTE_PREFIX.length).replace(/^\//, '');
      return rel ? path.join(path.dirname(remoteRoot), ...rel.split('/')) : path.dirname(remoteRoot);
    }
    return norm.replaceAll('/', path.sep);
  };
  const listFiles = async (baseDir) => {
    const out = [];
    const walk = async (dir, rel) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      await Promise.all(entries.map(async (entry) => {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, entryRel);
          return;
        }
        out.push(entryRel);
      }));
    };
    await walk(baseDir, '');
    return out.sort();
  };

  return async (args) => {
    const [cmd, src, dest] = args;
    if (cmd === 'copy' && args.includes('--include')) {
      // staging 拉取：只搬运 `<entryId>/meta.json`（对应 --include 通配）到调用参数给定的目录
      const srcPath = toPath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      const files = await listFiles(srcPath);
      await Promise.all(files
        .filter((rel) => rel.split('/').length === 2 && rel.endsWith('/meta.json'))
        .map(async (rel) => {
          const destPath = toPath(dest);
          const destFile = path.join(destPath, ...rel.split('/'));
          await fs.mkdir(path.dirname(destFile), { recursive: true });
          await fs.copyFile(path.join(srcPath, ...rel.split('/')), destFile);
        }));
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'copyto') {
      const srcPath = toPath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'object not found' };
      }
      const destPath = toPath(dest);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'moveto') {
      const srcPath = toPath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'object not found' };
      }
      const destPath = toPath(dest);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.rename(srcPath, destPath);
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'lsf') {
      const srcPath = toPath(src);
      if (!(await fs.stat(srcPath).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      const files = await listFiles(srcPath);
      return { code: 0, stdout: `${files.join('\n')}\n`, stderr: '' };
    }
    if (cmd === 'purge' || cmd === 'deletefile') {
      const p = toPath(src);
      if (!(await fs.stat(p).catch(() => null))) {
        return { code: 3, stdout: '', stderr: 'Directory not found.' };
      }
      await fs.rm(p, { recursive: cmd === 'purge', force: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    throw new Error(`模拟 rclone 未实现的命令：${args.join(' ')}`);
  };
};

/** 在远端条目目录写入数据包形态的数据：<entryId>/data.zip */
export const writeRemoteZip = async (remoteEntryDir, files) => {
  const stagingRoot = path.join(remoteEntryDir, '..', '.zip-staging');
  const staging = path.join(stagingRoot, Math.random().toString(36).slice(2));
  await fs.mkdir(staging, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, content]) => fs.writeFile(
    path.join(staging, name),
    content,
    'utf8',
  )));
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip();
  zip.addLocalFolder(staging);
  await fs.mkdir(remoteEntryDir, { recursive: true });
  await zip.writeZipPromise(path.join(remoteEntryDir, 'data.zip'));
  await fs.rm(stagingRoot, { recursive: true, force: true });
};

/** 读取远端条目数据包内的文件内容（缺条目返回 null） */
export const readRemoteZipEntry = async (remoteEntryDir, name) => {
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(path.join(remoteEntryDir, 'data.zip'));
  const entry = zip.getEntry(name);
  return entry ? entry.getData().toString('utf8') : null;
};
