/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
  asar: false,
  directories: {
    output: 'dist_electron',
    buildResources: 'buildResources',
    app: 'dist',
  },
  files: [
    '**',
  ],
  nsis: {
    oneClick: false,
  },
  win: {
    target: [
      {
        target: 'nsis',
        arch: [
          'x64',
        ],
      },
      {
        target: 'portable',
        arch: [
          'x64',
        ],
      },
    ],
  },
};

module.exports = config;
