import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runPnpm(repoRoot, args) {
  const result = spawnSync(
    'pnpm',
    args,
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === '--name') {
      args.name = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

const { name } = parseArgs(process.argv.slice(2));

if (!name) {
  fail('Missing required argument: --name <package-name>');
}

const repoRoot = process.cwd();
const packagesRoot = path.join(repoRoot, 'packages');
const packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let packageDir;
let manifest;

for (const dirName of packageDirs) {
  const currentDir = path.join(packagesRoot, dirName);
  const manifestPath = path.join(currentDir, 'package.json');

  if (!existsSync(manifestPath)) {
    continue;
  }

  const currentManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  if (currentManifest.name === name) {
    packageDir = currentDir;
    manifest = currentManifest;
    break;
  }
}

if (!packageDir || !manifest) {
  fail(`Package name not found in packages/*/package.json: ${name}`);
}

if (manifest.private) {
  fail(`Package "${name}" is private and cannot be published`);
}

if (!manifest.version) {
  fail(`Package "${name}" is missing version`);
}

if (manifest.scripts?.build) {
  runPnpm(repoRoot, ['--filter', name, 'run', 'build']);
}

const distDir = path.join(packageDir, 'dist');

if (!existsSync(distDir)) {
  fail(`Build output not found: ${distDir}`);
}

runPnpm(repoRoot, ['--filter', name, 'publish', '--no-git-checks']);
