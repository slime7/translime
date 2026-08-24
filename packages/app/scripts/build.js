#!/usr/bin/env node

import builder from 'electron-builder';
import { build as viteBuild } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
// eslint-disable-next-line import-x/extensions
import builderConfig from '../electron-builder.config.js';
import pkg from '../package.json' with { type: 'json' };

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {'production' | 'development' | 'test'} BuildMode
 * @type {BuildMode}
 */
// eslint-disable-next-line no-multi-assign
const mode = process.env.MODE = process.env.MODE || 'production';
const buildArgs = process.argv.slice(2);

// 配置文件的路径数组，提取为常量提高可读性
const VITE_CONFIG_PATHS = [
  resolve(appRoot, 'src/vite.main.config.js'),
  resolve(appRoot, 'src/vite.preload.config.js'),
  resolve(appRoot, 'src/vite.renderer.config.js'),
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
    process.chdir(appRoot);
    await buildVitePackages();
    preparePackageJson();

    const outputDir = resolve(appRoot, builderConfig.directories.app || 'dist');
    fs.writeFileSync(
      `${outputDir}/package.json`,
      JSON.stringify(pkg, null, 2),
    );

    const shouldUnpack = buildArgs.includes('--unpack');
    let platform = builder.Platform.current();
    if (buildArgs.includes('--linux')) {
      platform = builder.Platform.LINUX;
    } else if (buildArgs.includes('--win')) {
      platform = builder.Platform.WINDOWS;
    } else if (buildArgs.includes('--mac')) {
      platform = builder.Platform.MAC;
    }

    const targets = platform.createTarget(shouldUnpack ? builder.DIR_TARGET : undefined);

    await builder.build({
      config: builderConfig,
      publish: 'never',
      targets,
    });
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

// 执行构建
buildElectronApp();
