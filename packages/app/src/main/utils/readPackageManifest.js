import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import json5 from 'json5';

/**
 * 受支持的包信息文件列表及其对应的解析器，按优先级排列
 * @type {Array<{file: string, parser: function(string): object}>}
 */
const MANIFEST_FORMATS = [
  { file: 'package.json', parser: (text) => JSON.parse(text) },
  { file: 'package.json5', parser: (text) => json5.parse(text) },
  { file: 'package.yaml', parser: (text) => yaml.load(text) },
];

/**
 * 按优先级读取目录中的包信息文件（package.json > package.json5 > package.yaml）
 * @param {string} dir - 包根目录
 * @returns {object} 解析后的包信息对象
 * @throws {Error} 未找到任何受支持的包信息文件时抛出
 */
const readPackageManifest = (dir) => {
  const match = MANIFEST_FORMATS.find(({ file }) => {
    try {
      fs.accessSync(path.join(dir, file));
      return true;
    } catch (err) {
      return false;
    }
  });
  if (!match) {
    throw new Error(`在 "${dir}" 中未找到有效的包信息文件（package.json / package.json5 / package.yaml）`);
  }
  return match.parser(fs.readFileSync(path.join(dir, match.file), 'utf8'));
};

export default readPackageManifest;
