#!/usr/bin/env node

const builder = require('electron-builder');
const { build: viteBuild } = require('vite');
const { dirname, resolve } = require('path');
const fs = require('fs');
const builderConfig = require('../electron-builder.config');
const pkg = require('../package.json');

/** @type 'production' | 'development' | 'test' */
// eslint-disable-next-line no-multi-assign
const mode = process.env.MODE = process.env.MODE || 'production';
const buildArgs = process.argv.slice(2);

const packagesConfigs = [
  'src/vite.main.config.js',
  'src/vite.preload.config.js',
  'src/vite.renderer.config.js',
];

/**
 * Run `vite build` for config file
 */
const buildByConfig = (configFile) => viteBuild({
  configFile,
  mode,
});

async function buildApp() {
  try {
    const totalTimeLabel = 'Total bundling time';
    console.time(totalTimeLabel);

    // eslint-disable-next-line no-restricted-syntax
    for (const packageConfigPath of packagesConfigs) {
      const consoleGroupName = `${dirname(packageConfigPath)}/`;
      console.group(consoleGroupName);

      const timeLabel = 'Bundling time';
      console.time(timeLabel);

      // eslint-disable-next-line no-await-in-loop
      await buildByConfig(packageConfigPath);

      console.timeEnd(timeLabel);
      console.groupEnd();
      console.log('\n'); // Just for pretty print
    }
    console.timeEnd(totalTimeLabel);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

function build() {
  buildApp()
    .then(() => {
      delete pkg.devDependencies;
      delete pkg.scripts;
      const externals = pkg.external;
      Object.keys(pkg.dependencies || {}).forEach((dependency) => {
        if (!externals.includes(dependency)) {
          delete pkg.dependencies[dependency];
        }
      });
      pkg.main = pkg.main.replace('dist/', '');
      const outputDir = resolve(builderConfig.directories.app || 'dist');
      fs.writeFileSync(
        `${outputDir}/package.json`,
        JSON.stringify(pkg, null, 2),
      );
      builder.build({ config: builderConfig, dir: buildArgs.indexOf('--unpack') > -1, publish: 'never' });
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

build();
