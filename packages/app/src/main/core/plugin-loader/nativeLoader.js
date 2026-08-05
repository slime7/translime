/* eslint-disable no-underscore-dangle */
import path from 'node:path';
import fs from 'node:fs';
import Module from 'node:module';
import logger from '../../utils/logger';
import {
  PLUGIN_DIR,
  PLUGIN_DIR_DEV,
  TEMP_NODE_DIR,
} from './constants';

/**
 * 原生 `.node` 模块的影子加载工具。
 *
 * 某些插件会锁定自身目录里的原生模块文件，导致更新、重载或卸载失败。
 * 这里通过复制到临时目录再加载的方式，减少目录锁定问题。
 */

/**
 * 注册 `.node` 模块的影子加载补丁。
 *
 * 只有位于插件正式目录或开发目录下的原生模块才会被复制到临时目录加载；
 * 其他模块保持 Node 默认行为。
 *
 * @returns {void}
 */
const setupNodeLoaderHack = () => {
  const originalLoader = Module._extensions['.node'];
  Module._extensions['.node'] = (module, filename) => {
    const lowerFilename = filename.toLowerCase();
    if (
      lowerFilename.startsWith(PLUGIN_DIR.toLowerCase())
      || lowerFilename.startsWith(PLUGIN_DIR_DEV.toLowerCase())
    ) {
      try {
        const tempFileName = `${path.basename(filename, '.node')}.${Date.now()}.`
          + `${Math.random().toString(36).slice(2)}.node`;
        const tempPath = path.join(TEMP_NODE_DIR, tempFileName);

        if (!fs.existsSync(TEMP_NODE_DIR)) {
          fs.mkdirSync(TEMP_NODE_DIR, { recursive: true });
        }

        fs.copyFileSync(filename, tempPath);
        logger.debug(`[plugin] Shadow loaded .node module: ${filename} -> ${tempPath}`);
        return originalLoader(module, tempPath);
      } catch (e) {
        logger.warn(`[plugin] Failed to shadow load .node module: ${filename}`, e);
      }
    }
    return originalLoader(module, filename);
  };
};

/**
 * 清理影子加载过程中残留的临时 `.node` 文件。
 *
 * @returns {void}
 */
const cleanTempNodeFiles = () => {
  try {
    if (fs.existsSync(TEMP_NODE_DIR)) {
      const files = fs.readdirSync(TEMP_NODE_DIR);
      files.forEach((file) => {
        try {
          fs.rmSync(path.join(TEMP_NODE_DIR, file), { force: true });
        } catch (e) {
          // ignore
        }
      });
    }
  } catch (e) {
    // ignore
  }
};

export {
  cleanTempNodeFiles,
  setupNodeLoaderHack,
};
