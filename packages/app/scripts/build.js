#!/usr/bin/env node

import builder from 'electron-builder';
import { build as viteBuild } from 'vite';
import { resolve } from 'node:path';
import fs from 'node:fs';
// eslint-disable-next-line import/extensions
import builderConfig from '../electron-builder.config.js';
import pkg from '../package.json' with { type: 'json' };

/**
 * @typedef {'production' | 'development' | 'test'} BuildMode
 * @type {BuildMode}
 */
// eslint-disable-next-line no-multi-assign
const mode = process.env.MODE = process.env.MODE || 'production';
const buildArgs = process.argv.slice(2);

// 配置文件的路径数组，提取为常量提高可读性
const VITE_CONFIG_PATHS = [
  'src/vite.main.config.js',
  'src/vite.preload.config.js',
  'src/vite.renderer.config.js',
];

/**
 * 使用指定的配置文件运行vite构建
 * @param {string} configFile - Vite配置文件的路径
 * @returns {Promise<void>}
 */
const buildWithConfig = async (configFile) => {
  await viteBuild({ configFile, mode });
};

/**
 * 构建所有Vite配置包
 * @returns {Promise<void>}
 */
const buildVitePackages = async () => {
  const totalTimeLabel = 'Total bundling time';
  console.time(totalTimeLabel);

  await Promise.all(VITE_CONFIG_PATHS.map(async (configPath) => {
    const timeLabel = `Bundling time [${configPath}]`;
    console.time(timeLabel);
    await buildWithConfig(configPath);
    console.timeEnd(timeLabel);
  }));

  console.timeEnd(totalTimeLabel);
};

/**
 * 清理并准备最终的package.json
 * @returns {void}
 */
const preparePackageJson = () => {
  delete pkg.devDependencies;
  delete pkg.scripts;

  const externals = pkg.external || [];
  Object.keys(pkg.dependencies || {}).forEach((dependency) => {
    if (!externals.includes(dependency)) {
      delete pkg.dependencies[dependency];
    }
  });

  pkg.main = pkg.main.replace('dist/', '');
};

/**
 * 构建Electron应用
 * @returns {Promise<void>}
 */
const buildElectronApp = async () => {
  try {
    await buildVitePackages();
    preparePackageJson();

    const outputDir = resolve(builderConfig.directories.app || 'dist');
    fs.writeFileSync(
      `${outputDir}/package.json`,
      JSON.stringify(pkg, null, 2),
    );

    const shouldUnpack = buildArgs.includes('--unpack');
    await builder.build({
      config: builderConfig,
      dir: shouldUnpack,
      publish: 'never',
    });
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

// 执行构建
buildElectronApp();
