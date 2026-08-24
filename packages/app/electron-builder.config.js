/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
  productName: 'translime',
  appId: 'translime.app',
  asar: true,
  asarUnpack: [
    'node_modules/**',
  ],
  electronLanguages: ['zh-CN', 'en-US', 'ja'],
  compression: 'normal',
  directories: {
    output: 'dist_electron',
    buildResources: 'buildResources',
    app: 'dist',
  },
  npmArgs: [
    '--ignore-scripts',
  ],
  npmRebuild: false,
  files: [
    '**',
  ],
  nsis: {
    oneClick: false,
    // eslint-disable-next-line no-template-curly-in-string
    artifactName: '${productName}-setup-${version}.${ext}',
  },
  win: {
    // eslint-disable-next-line no-template-curly-in-string
    artifactName: '${productName}-${version}.${ext}',
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
  linux: {
    // eslint-disable-next-line no-template-curly-in-string
    artifactName: '${productName}-${version}-${arch}.${ext}',
    category: 'Utility',
    icon: 'buildResources/icon.png',
    executableArgs: [
      '--ozone-platform-hint=auto',
      '--enable-wayland-ime',
    ],
    desktop: {
      entry: {
        StartupWMClass: 'translime',
        Icon: 'translime',
      },
    },
    target: [
      {
        target: 'AppImage',
        arch: [
          'x64',
        ],
      },
      {
        target: 'tar.gz',
        arch: [
          'x64',
        ],
      },
    ],
  },
  protocols: [
    {
      name: 'translime',
      schemes: ['translime'],
    },
  ],
  publish: [
    {
      provider: 'github',
      owner: 'slime7',
      repo: 'translime',
    },
  ],
};

export default config;
