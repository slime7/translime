import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { net } from 'electron';
import * as tar from 'tar';
import mainStore from '../../utils/useMainStore';
import logger from '../../utils/logger';
import {
  PLUGIN_JSON_PATH,
  PLUGIN_MODULES_PATH,
  PLUGIN_PACKAGE_DIR,
} from './constants';

/**
 * 插件包安装相关的底层文件与网络操作。
 *
 * 这里不直接触碰 `PluginLoader` 运行态，只负责：
 * - 读取 tarball 里的 package 信息
 * - 请求 registry 元数据
 * - 下载与解压 tarball
 * - 更新插件宿主 package.json
 */

/**
 * 从插件 tarball 中读取 `package/package.json`。
 *
 * @param {string} filePath - tarball 文件路径。
 * @returns {Promise<object>} 解析后的 package.json 内容。
 */
async function readPluginPackageInfo(filePath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const unzipStream = fileStream.pipe(zlib.createGunzip());
    const extractStream = unzipStream.pipe(
      tar.extract({ cwd: mainStore.TEMP_DIR }),
    );

    let found = false;

    extractStream.on('entry', (entry) => {
      if (entry.path === 'package/package.json') {
        found = true;
        let content = '';
        entry.on('data', (chunk) => {
          content += chunk.toString();
        });
        entry.on('end', () => {
          try {
            resolve(JSON.parse(content));
          } catch (err) {
            reject(new Error('无法读取插件信息'));
          }
        });
      } else {
        entry.resume();
      }
    });

    extractStream.on('end', () => {
      if (!found) {
        reject(new Error('无法识别这个插件包'));
      }
    });

    extractStream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 获取当前配置中的 npm registry 地址。
 *
 * @returns {string} 去掉末尾斜杠后的 registry 地址。
 */
const getRegistry = () => mainStore.config.get(
  'setting.registry',
  'https://registry.npmmirror.com/',
).replace(/\/$/, '');

/**
 * 拉取插件包元数据并解析 tarball 下载地址。
 *
 * @param {string} packageName - 插件包名。
 * @param {string} [version] - 指定版本；为空时请求 latest。
 * @returns {Promise<{version: string, tarball: string|undefined}>}
 * 版本号与 tarball 地址。
 */
const fetchPackageMetadata = (packageName, version) => new Promise((resolve, reject) => {
  const registry = getRegistry();
  const url = version
    ? `${registry}/${packageName}/${version}`
    : `${registry}/${packageName}/latest`;

  logger.debug('[plugin] 获取包元数据', { url });

  const request = net.request({ method: 'GET', url });

  request.on('response', (response) => {
    if (response.statusCode === 404) {
      reject(new Error(`插件"${packageName}"不存在`));
      return;
    }
    if (response.statusCode !== 200) {
      reject(new Error(`获取包信息失败: HTTP ${response.statusCode}`));
      return;
    }

    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        resolve({
          version: data.version,
          tarball: data.dist ? data.dist.tarball : undefined,
        });
      } catch (err) {
        reject(new Error('解析包元数据失败'));
      }
    });
    response.on('error', reject);
  });

  request.on('error', reject);
  request.end();
});

/**
 * 下载 tarball 到指定路径。
 *
 * 支持跟随 HTTP 3xx 重定向。
 *
 * @param {string} tarballUrl - tarball 下载地址。
 * @param {string} destPath - 目标文件路径。
 * @returns {Promise<void>}
 */
const downloadTarball = (tarballUrl, destPath) => new Promise((resolve, reject) => {
  logger.debug('[plugin] 下载 tarball', { url: tarballUrl, dest: destPath });

  const request = net.request({ method: 'GET', url: tarballUrl });

  request.on('response', (response) => {
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      const redirectUrl = Array.isArray(response.headers.location)
        ? response.headers.location[0]
        : response.headers.location;
      downloadTarball(redirectUrl, destPath).then(resolve).catch(reject);
      return;
    }

    if (response.statusCode !== 200) {
      reject(new Error(`下载失败: HTTP ${response.statusCode}`));
      return;
    }

    const writeStream = fs.createWriteStream(destPath);
    response.on('data', (chunk) => writeStream.write(chunk));
    response.on('end', () => {
      writeStream.end();
      writeStream.on('finish', resolve);
    });
    response.on('error', (err) => {
      writeStream.destroy();
      reject(err);
    });
  });

  request.on('error', reject);
  request.end();
});

/**
 * 将插件 tarball 解压到插件安装目录。
 *
 * tarball 内部通常包含一层 `package/` 目录，这里会用 `strip: 1` 去掉它。
 *
 * @param {string} tarballPath - tarball 文件路径。
 * @param {string} packageName - 插件包名。
 * @returns {Promise<void>}
 */
const extractTarball = async (tarballPath, packageName) => {
  const destDir = path.join(PLUGIN_MODULES_PATH, packageName);

  await fsp.mkdir(destDir, { recursive: true });

  logger.debug('[plugin] 解压 tarball', { src: tarballPath, dest: destDir });

  await pipeline(
    fs.createReadStream(tarballPath),
    zlib.createGunzip(),
    tar.extract({
      cwd: destDir,
      strip: 1,
    }),
  );
};

/**
 * 更新插件宿主 package.json 中的依赖记录。
 *
 * @param {string} packageName - 插件包名。
 * @param {string|null} version - 要写入的版本号。
 * @param {'add'|'remove'} action - 更新动作。
 * @returns {Promise<void>}
 */
const updatePluginDependency = async (packageName, version, action) => {
  const pkgContent = await fsp.readFile(PLUGIN_JSON_PATH, 'utf-8');
  const pkg = JSON.parse(pkgContent);

  if (!pkg.dependencies) {
    pkg.dependencies = {};
  }

  if (action === 'add') {
    pkg.dependencies[packageName] = version;
  } else if (action === 'remove') {
    delete pkg.dependencies[packageName];
  }

  await fsp.writeFile(PLUGIN_JSON_PATH, JSON.stringify(pkg, null, 2), 'utf-8');
  logger.debug('[plugin] 更新 package.json', { packageName, version, action });
};

/**
 * 生成 tarball 在缓存目录中的保存路径。
 *
 * @param {string} packageName - 插件包名。
 * @param {string} version - 插件版本号。
 * @returns {string} tarball 缓存路径。
 */
const getTarballPath = (packageName, version) => {
  const safeName = packageName.replace(/\//g, '-');
  return path.join(PLUGIN_PACKAGE_DIR, `${safeName}-${version}.tgz`);
};

/**
 * 生成本地插件包复制到缓存目录后的路径。
 *
 * @param {string} file - 用户选择的本地 tarball 路径。
 * @returns {string} 插件缓存目录中的目标路径。
 */
const getLocalPackagePath = (file) => {
  const fileParsed = path.parse(file);
  return path.join(PLUGIN_PACKAGE_DIR, fileParsed.base);
};

export {
  downloadTarball,
  extractTarball,
  fetchPackageMetadata,
  getLocalPackagePath,
  getTarballPath,
  readPluginPackageInfo,
  updatePluginDependency,
};
