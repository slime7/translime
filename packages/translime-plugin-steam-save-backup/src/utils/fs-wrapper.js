import fs from 'node:fs/promises';
import path from 'node:path';

export const pathExists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

export const ensureDir = async (p) => {
  await fs.mkdir(p, { recursive: true });
};

export const { readFile } = fs;
export const { readdir } = fs;
export const { stat } = fs;

export const copy = async (src, dest, options = {}) => {
  const { overwrite, ...rest } = options;
  // fs-extra default overwrite is true. fs.cp default force is true.
  // Map overwrite to force.
  const force = overwrite !== undefined ? overwrite : true;
  await fs.cp(src, dest, { recursive: true, force, ...rest });
};

export const writeJson = async (file, object, options = {}) => {
  const spaces = options.spaces || 0;
  const str = JSON.stringify(object, null, spaces);
  await fs.writeFile(file, str, 'utf8');
};

export const readJson = async (file) => {
  const str = await fs.readFile(file, 'utf8');
  return JSON.parse(str);
};

export const remove = async (p) => {
  await fs.rm(p, { recursive: true, force: true });
};

export const emptyDir = async (dir) => {
  if (!(await pathExists(dir))) {
    await ensureDir(dir);
    return;
  }
  const items = await fs.readdir(dir);
  await Promise.all(items.map((item) => remove(path.join(dir, item))));
};

export default {
  pathExists,
  ensureDir,
  readFile,
  readdir,
  stat,
  copy,
  writeJson,
  readJson,
  remove,
  emptyDir,
};
