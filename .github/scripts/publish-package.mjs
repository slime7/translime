import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SDK_DIRECTORY = 'sdk';
const SDK_PACKAGE_NAME = 'translime-sdk';
const PLUGIN_PREFIX = 'translime-plugin-';
const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * @typedef {object} WorkspacePackage
 * @property {string} directoryName
 * @property {string} directoryPath
 * @property {Record<string, *>} manifest
 */

/**
 * @typedef {object} PublishState
 * @property {string[]} published
 * @property {string[]} skipped
 * @property {string[]} failed
 */

/**
 * Resolve Windows command shims without invoking a shell.
 *
 * @param {string} command Command name.
 * @returns {string} Platform-specific executable name.
 */
function resolveExecutable(command) {
  if (process.platform === 'win32' && ['npm', 'pnpm'].includes(command)) {
    return `${command}.cmd`;
  }

  return command;
}

/**
 * Check whether a command needs the Windows command interpreter.
 *
 * @param {string} command Command name.
 * @returns {boolean} Whether the command is a Windows command shim.
 */
function requiresWindowsShell(command) {
  return process.platform === 'win32' && ['npm', 'pnpm'].includes(command);
}

/**
 * Run a command and throw when it fails.
 *
 * @param {string} command Command name.
 * @param {string[]} args Command arguments.
 * @param {{ cwd: string, capture?: boolean }} options Execution options.
 * @returns {import('node:child_process').SpawnSyncReturns<string>} Command result.
 */
function runCommand(command, args, options) {
  const capture = options.capture ?? false;
  const result = spawnSync(
    resolveExecutable(command),
    args,
    {
      cwd: options.cwd,
      encoding: 'utf8',
      shell: requiresWindowsShell(command),
      stdio: capture ? 'pipe' : 'inherit',
      windowsHide: true,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    const suffix = detail ? `\n${detail}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.${suffix}`);
  }

  return result;
}

/**
 * Run an npm registry query without treating a non-zero exit as an exception.
 *
 * @param {string[]} args npm arguments.
 * @param {string} cwd Working directory.
 * @returns {import('node:child_process').SpawnSyncReturns<string>} Command result.
 */
function runNpmQuery(args, cwd) {
  const result = spawnSync(
    resolveExecutable('npm'),
    args,
    {
      cwd,
      encoding: 'utf8',
      shell: requiresWindowsShell('npm'),
      stdio: 'pipe',
      windowsHide: true,
    },
  );

  if (result.error) {
    throw result.error;
  }

  return result;
}

/**
 * Check whether an npm query failed because a package or version does not exist.
 *
 * @param {import('node:child_process').SpawnSyncReturns<string>} result npm result.
 * @returns {boolean} Whether npm returned E404.
 */
function isNpmNotFound(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return /\bE404\b|404 Not Found/i.test(output);
}

/**
 * Parse a stable semantic version.
 *
 * @param {string} version Version text.
 * @returns {[number, number, number]} Numeric version tuple.
 */
export function parseStableVersion(version) {
  const match = STABLE_VERSION_PATTERN.exec(version);

  if (!match) {
    throw new Error(`Only stable semantic versions are supported: ${version}`);
  }

  return match.slice(1).map(Number);
}

/**
 * Compare two stable semantic versions.
 *
 * @param {string} left Left version.
 * @param {string} right Right version.
 * @returns {-1 | 0 | 1} Comparison result.
 */
export function compareStableVersions(left, right) {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }

    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }

  return 0;
}

/**
 * Read all npm-publishable workspace packages.
 *
 * @param {string} repoRoot Repository root.
 * @returns {WorkspacePackage[]} Publishable packages in release order.
 */
export function discoverPublishablePackages(repoRoot) {
  const packagesRoot = path.join(repoRoot, 'packages');
  const directoryNames = readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === SDK_DIRECTORY || name.startsWith(PLUGIN_PREFIX))
    .filter((name) => existsSync(path.join(packagesRoot, name, 'package.json')))
    .sort((left, right) => {
      if (left === SDK_DIRECTORY) {
        return -1;
      }

      if (right === SDK_DIRECTORY) {
        return 1;
      }

      return left.localeCompare(right);
    });

  return directoryNames.map((directoryName) => {
    const directoryPath = path.join(packagesRoot, directoryName);
    const manifestPath = path.join(directoryPath, 'package.json');

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const expectedName = directoryName === SDK_DIRECTORY ? SDK_PACKAGE_NAME : directoryName;

    if (manifest.name !== expectedName) {
      throw new Error(
        `Package name must match its publishable directory: expected ${expectedName}, got ${manifest.name}`,
      );
    }

    parseStableVersion(manifest.version);

    return {
      directoryName,
      directoryPath,
      manifest,
    };
  });
}

/**
 * Parse supported command-line arguments.
 *
 * @param {string[]} argv Command-line arguments.
 * @returns {{ name?: string }} Parsed arguments.
 */
export function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current !== '--name') {
      throw new Error(`Unknown argument: ${current}`);
    }

    const name = argv[index + 1];

    if (!name || name.startsWith('--')) {
      throw new Error('Missing required value for --name');
    }

    args.name = name;
    index += 1;
  }

  return args;
}

/**
 * Convert a package-relative path to its tar archive path.
 *
 * @param {string} relativePath Package-relative path.
 * @returns {string} Normalized archive path.
 */
function toArchivePath(relativePath) {
  return `package/${relativePath.replace(/^[./\\]+/, '').replaceAll('\\', '/')}`;
}

/**
 * Collect local entry paths declared by an exports object.
 *
 * @param {*} value Current exports value.
 * @param {Set<string>} paths Collected package-relative paths.
 * @returns {void}
 */
function collectExportPaths(value, paths) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) {
      paths.add(value);
    }

    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  Object.values(value).forEach((nestedValue) => {
    collectExportPaths(nestedValue, paths);
  });
}

/**
 * Collect files that must be present in a packed package.
 *
 * @param {Record<string, *>} manifest package.json content.
 * @returns {string[]} Required archive paths.
 */
export function collectRequiredArchivePaths(manifest) {
  const requiredPaths = new Set(['package/package.json']);

  ['main', 'module', 'types'].forEach((field) => {
    if (typeof manifest[field] === 'string') {
      requiredPaths.add(toArchivePath(manifest[field]));
    }
  });

  const exportPaths = new Set();
  collectExportPaths(manifest.exports, exportPaths);
  exportPaths.forEach((exportPath) => {
    requiredPaths.add(toArchivePath(exportPath));
  });

  if (manifest.plugin && typeof manifest.plugin === 'object') {
    ['icon', 'ui', 'windowUrl'].forEach((field) => {
      if (typeof manifest.plugin[field] === 'string') {
        requiredPaths.add(toArchivePath(manifest.plugin[field]));
      }
    });
  }

  return [...requiredPaths].sort();
}

/**
 * Validate the contents of a packed npm tarball.
 *
 * @param {WorkspacePackage} workspacePackage Package metadata.
 * @param {string[]} archiveEntries Tar archive entries.
 * @returns {void}
 */
export function validateArchiveEntries(workspacePackage, archiveEntries) {
  const normalizedEntries = archiveEntries
    .map((entry) => entry.trim().replaceAll('\\', '/'))
    .filter(Boolean);
  const requiredPaths = collectRequiredArchivePaths(workspacePackage.manifest);

  requiredPaths.forEach((requiredPath) => {
    if (!normalizedEntries.includes(requiredPath)) {
      throw new Error(`${workspacePackage.manifest.name} tarball is missing ${requiredPath}`);
    }
  });

  const declaredFiles = workspacePackage.manifest.files ?? [];
  declaredFiles.forEach((declaredFile) => {
    const archivePath = toArchivePath(declaredFile).replace(/\/$/, '');
    const included = normalizedEntries.some(
      (entry) => entry === archivePath || entry.startsWith(`${archivePath}/`),
    );

    if (!included) {
      throw new Error(`${workspacePackage.manifest.name} tarball is missing files entry ${declaredFile}`);
    }
  });

  const forbiddenEntry = normalizedEntries.find(
    (entry) => entry.startsWith('package/target/') || entry.startsWith('package/.git/'),
  );

  if (forbiddenEntry) {
    throw new Error(`${workspacePackage.manifest.name} tarball contains forbidden file ${forbiddenEntry}`);
  }

  if (workspacePackage.manifest.name === 'translime-plugin-hdr-capture') {
    const hasNativeBinding = normalizedEntries.some(
      (entry) => entry.startsWith('package/dist/bin/') && entry.endsWith('.node'),
    );

    if (!hasNativeBinding) {
      throw new Error('translime-plugin-hdr-capture tarball is missing its Windows native binding');
    }
  }
}

/**
 * Resolve publication state for a local package.
 *
 * @param {WorkspacePackage} workspacePackage Package metadata.
 * @param {string} repoRoot Repository root.
 * @returns {'pending' | 'skipped'} Publication state.
 */
function resolvePublicationState(workspacePackage, repoRoot) {
  const { name, version } = workspacePackage.manifest;
  const exactResult = runNpmQuery(['view', `${name}@${version}`, 'version', '--json'], repoRoot);

  if (exactResult.status === 0) {
    return 'skipped';
  }

  if (!isNpmNotFound(exactResult)) {
    const detail = `${exactResult.stdout ?? ''}\n${exactResult.stderr ?? ''}`.trim();
    throw new Error(`Unable to query ${name}@${version} from npm.\n${detail}`);
  }

  const latestResult = runNpmQuery(['view', name, 'version', '--json'], repoRoot);

  if (latestResult.status !== 0) {
    if (isNpmNotFound(latestResult)) {
      throw new Error(
        `${name} has not been published before; publish its first version manually, then configure Trusted Publisher`,
      );
    }

    const detail = `${latestResult.stdout ?? ''}\n${latestResult.stderr ?? ''}`.trim();
    throw new Error(`Unable to query the latest ${name} version from npm.\n${detail}`);
  }

  const latestVersion = JSON.parse(latestResult.stdout);
  parseStableVersion(latestVersion);

  if (compareStableVersions(version, latestVersion) <= 0) {
    throw new Error(
      `${name}@${version} is not newer than the latest npm version ${latestVersion}`,
    );
  }

  return 'pending';
}

/**
 * Confirm that the Windows native build toolchain is available.
 *
 * @param {string} repoRoot Repository root.
 * @returns {void}
 */
function verifyHdrCaptureToolchain(repoRoot) {
  if (process.platform !== 'win32') {
    throw new Error('translime-plugin-hdr-capture must be published from a Windows runner');
  }

  const rustResult = runCommand('rustc', ['-vV'], { cwd: repoRoot, capture: true });
  process.stdout.write(`${rustResult.stdout.trim()}\n`);

  if (!rustResult.stdout.includes('host: x86_64-pc-windows-msvc')) {
    throw new Error('Rust host must be x86_64-pc-windows-msvc');
  }

  runCommand('cargo', ['--version'], { cwd: repoRoot });
  runCommand('rustup', ['show', 'active-toolchain'], { cwd: repoRoot });

  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const vswherePath = path.join(
    programFilesX86,
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );

  if (!existsSync(vswherePath)) {
    throw new Error(`Visual Studio locator was not found: ${vswherePath}`);
  }

  const visualStudioResult = runCommand(
    vswherePath,
    [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
    { cwd: repoRoot, capture: true },
  );
  const installationPath = visualStudioResult.stdout.trim();

  if (!installationPath) {
    throw new Error('Visual Studio x64 C++ build tools are not installed');
  }

  process.stdout.write(`Visual Studio C++ toolchain: ${installationPath}\n`);
}

/**
 * Build and test a workspace package.
 *
 * @param {WorkspacePackage} workspacePackage Package metadata.
 * @param {string} repoRoot Repository root.
 * @returns {void}
 */
function buildAndTestPackage(workspacePackage, repoRoot) {
  const { name, scripts = {} } = workspacePackage.manifest;

  if (scripts.build) {
    runCommand('pnpm', ['--filter', name, 'run', 'build'], { cwd: repoRoot });
  }

  if (scripts.test) {
    runCommand('pnpm', ['--filter', name, 'run', 'test'], { cwd: repoRoot });
  }
}

/**
 * Pack and validate a workspace package.
 *
 * @param {WorkspacePackage} workspacePackage Package metadata.
 * @param {string} repoRoot Repository root.
 * @param {string[]} temporaryDirectories Temporary directories to clean.
 * @returns {string} Absolute tarball path.
 */
function packAndValidatePackage(workspacePackage, repoRoot, temporaryDirectories) {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'translime-npm-package-'),
  );
  temporaryDirectories.push(temporaryDirectory);

  runCommand(
    'pnpm',
    [
      '--filter',
      workspacePackage.manifest.name,
      'pack',
      '--pack-destination',
      temporaryDirectory,
    ],
    { cwd: repoRoot },
  );

  const tarballs = readdirSync(temporaryDirectory)
    .filter((entry) => entry.endsWith('.tgz'));

  if (tarballs.length !== 1) {
    throw new Error(
      `${workspacePackage.manifest.name} produced ${tarballs.length} tarballs instead of one`,
    );
  }

  const tarballPath = path.join(temporaryDirectory, tarballs[0]);
  const archiveResult = runCommand('tar', ['-tf', tarballPath], {
    cwd: repoRoot,
    capture: true,
  });
  validateArchiveEntries(workspacePackage, archiveResult.stdout.split(/\r?\n/));

  return tarballPath;
}

/**
 * Append a release summary to the GitHub Actions job summary.
 *
 * @param {PublishState} state Publication results.
 * @returns {void}
 */
function writeSummary(state) {
  const lines = [
    '## npm publication',
    '',
    '| Result | Packages |',
    '| --- | --- |',
    `| Published | ${state.published.join(', ') || 'None'} |`,
    `| Skipped | ${state.skipped.join(', ') || 'None'} |`,
    `| Failed | ${state.failed.join('<br>') || 'None'} |`,
    '',
  ];
  const summary = `${lines.join('\n')}\n`;

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
  } else {
    process.stdout.write(summary);
  }
}

/**
 * Publish all locally newer packages, or retry one explicitly selected package.
 *
 * @returns {Promise<void>} Completion promise.
 */
async function main() {
  const repoRoot = process.cwd();
  const temporaryDirectories = [];
  const state = {
    published: [],
    skipped: [],
    failed: [],
  };

  try {
    const { name } = parseArgs(process.argv.slice(2));
    const publishablePackages = discoverPublishablePackages(repoRoot);
    const selectedPackages = name
      ? publishablePackages.filter((workspacePackage) => workspacePackage.manifest.name === name)
      : publishablePackages;

    if (selectedPackages.length === 0) {
      throw new Error(`Package is not publishable from this repository: ${name}`);
    }

    const pendingPackages = [];

    selectedPackages.forEach((workspacePackage) => {
      const publicationState = resolvePublicationState(workspacePackage, repoRoot);
      const packageVersion = `${workspacePackage.manifest.name}@${workspacePackage.manifest.version}`;

      if (publicationState === 'skipped') {
        state.skipped.push(packageVersion);
      } else {
        pendingPackages.push(workspacePackage);
      }
    });

    if (pendingPackages.length === 0) {
      return;
    }

    const hdrCapturePending = pendingPackages.some(
      (workspacePackage) => workspacePackage.manifest.name === 'translime-plugin-hdr-capture',
    );

    if (hdrCapturePending) {
      verifyHdrCaptureToolchain(repoRoot);
    }

    const sdkPackage = publishablePackages.find(
      (workspacePackage) => workspacePackage.manifest.name === SDK_PACKAGE_NAME,
    );

    if (!sdkPackage) {
      throw new Error('Unable to resolve translime-sdk for package builds');
    }

    buildAndTestPackage(sdkPackage, repoRoot);

    pendingPackages
      .filter((workspacePackage) => workspacePackage.manifest.name !== SDK_PACKAGE_NAME)
      .forEach((workspacePackage) => {
        buildAndTestPackage(workspacePackage, repoRoot);
      });

    const artifacts = pendingPackages.map((workspacePackage) => ({
      workspacePackage,
      tarballPath: packAndValidatePackage(
        workspacePackage,
        repoRoot,
        temporaryDirectories,
      ),
    }));

    artifacts.forEach((artifact) => {
      runCommand(
        'npm',
        ['publish', artifact.tarballPath, '--access', 'public'],
        { cwd: repoRoot },
      );
      state.published.push(
        `${artifact.workspacePackage.manifest.name}@${artifact.workspacePackage.manifest.version}`,
      );
    });
  } catch (error) {
    state.failed.push(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    temporaryDirectories.forEach((temporaryDirectory) => {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    });
    writeSummary(state);
  }
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  await main();
}
