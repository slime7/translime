import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  collectRequiredArchivePaths,
  compareStableVersions,
  discoverPublishablePackages,
  parseArgs,
  parseStableVersion,
  validateArchiveEntries,
} from './publish-package.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

test('discovers only SDK and plugin package directories', () => {
  const packageNames = discoverPublishablePackages(repoRoot)
    .map((workspacePackage) => workspacePackage.manifest.name);

  assert.deepEqual(packageNames, [
    'translime-sdk',
    'translime-plugin-bangumi-logs',
    'translime-plugin-google-domains-ddns',
    'translime-plugin-hdr-capture',
    'translime-plugin-mahjong-2-emoji',
    'translime-plugin-namesilo-dns',
    'translime-plugin-rtmp-recorder',
    'translime-plugin-static-server',
    'translime-plugin-steam-save-backup',
  ]);
  assert.equal(packageNames.includes('translime'), false);
  assert.equal(packageNames.includes('translime-plugin-example'), false);
});

test('accepts stable semantic versions and compares them numerically', () => {
  assert.deepEqual(parseStableVersion('2.10.3'), [2, 10, 3]);
  assert.equal(compareStableVersions('2.10.0', '2.9.9'), 1);
  assert.equal(compareStableVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareStableVersions('0.9.9', '1.0.0'), -1);
  assert.throws(() => parseStableVersion('1.0.0-beta.1'));
  assert.throws(() => parseStableVersion('01.0.0'));
});

test('only accepts an optional package name argument', () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs(['--name', 'translime-sdk']), {
    name: 'translime-sdk',
  });
  assert.throws(() => parseArgs(['--name']));
  assert.throws(() => parseArgs(['--unknown', 'value']));
});

test('collects runtime entry points and plugin assets', () => {
  const requiredPaths = collectRequiredArchivePaths({
    main: './dist/index.cjs',
    exports: {
      '.': {
        import: './dist/index.js',
      },
    },
    plugin: {
      icon: './icon.png',
      ui: 'dist/ui.esm.js',
    },
  });

  assert.deepEqual(requiredPaths, [
    'package/dist/index.cjs',
    'package/dist/index.js',
    'package/dist/ui.esm.js',
    'package/icon.png',
    'package/package.json',
  ]);
});

test('rejects missing HDR native bindings and build caches', () => {
  const workspacePackage = {
    directoryName: 'translime-plugin-hdr-capture',
    directoryPath: 'unused',
    manifest: {
      name: 'translime-plugin-hdr-capture',
      files: ['dist'],
    },
  };

  assert.throws(
    () => validateArchiveEntries(workspacePackage, [
      'package/package.json',
      'package/dist/main.cjs.js',
    ]),
    /native binding/,
  );
  assert.throws(
    () => validateArchiveEntries(workspacePackage, [
      'package/package.json',
      'package/dist/bin/hdr-capture.node',
      'package/target/release/build.tmp',
    ]),
    /forbidden file/,
  );
});
