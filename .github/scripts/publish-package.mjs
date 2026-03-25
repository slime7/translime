import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(message) {
  console.error(message);
  process.exit(1);
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
const packageDir = path.join(repoRoot, 'packages', name);
const manifestPath = path.join(packageDir, 'package.json');

if (!existsSync(manifestPath)) {
  fail(`Package not found: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.name !== name) {
  fail(`Package name mismatch: expected "${name}", got "${manifest.name}"`);
}

if (manifest.private) {
  fail(`Package "${name}" is private and cannot be published`);
}

if (!manifest.version) {
  fail(`Package "${name}" is missing version`);
}

const publishResult = spawnSync(
  'pnpm',
  ['--filter', name, 'publish', '--no-git-checks'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  },
);

if (publishResult.status !== 0) {
  process.exit(publishResult.status ?? 1);
}
