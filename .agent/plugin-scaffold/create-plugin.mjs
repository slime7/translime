import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE_PLUGIN_NAME = 'template-translime-plugin';
const TEMPLATE_PLUGIN_ID = 'translime-plugin-example';
const TEXT_FILE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.vue',
  '.html',
  '.css',
  '.scss',
  '.yml',
  '.yaml',
  '.txt',
]);

function parseArgs(argv) {
  const options = {
    force: false,
    repo: process.cwd(),
    template: TEMPLATE_PLUGIN_NAME,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--name') {
      options.name = argv[++index];
      continue;
    }
    if (arg === '--title') {
      options.title = argv[++index];
      continue;
    }
    if (arg === '--description') {
      options.description = argv[++index];
      continue;
    }
    if (arg === '--template') {
      options.template = argv[++index];
      continue;
    }
    if (arg === '--repo') {
      options.repo = argv[++index];
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.name) {
    throw new Error('Missing required argument: --name <plugin-name>');
  }

  return options;
}

function toTitle(pluginName) {
  return pluginName
    .replace(/^translime-plugin-/, '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ensurePluginName(pluginName) {
  if (!/^translime-plugin-[a-z0-9-]+$/.test(pluginName)) {
    throw new Error(
      `Invalid plugin name "${pluginName}". Expected lowercase letters, digits, hyphens, and the prefix "translime-plugin-".`,
    );
  }
}

function copyDirectory(sourceDir, targetDir, force) {
  if (fs.existsSync(targetDir)) {
    if (!force) {
      throw new Error(`Target directory already exists: ${targetDir}`);
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: false,
  });
}

function replaceInTextFiles(rootDir, replacements) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      replaceInTextFiles(fullPath, replacements);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_FILE_EXTENSIONS.has(ext)) {
      continue;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let changed = false;
    for (const [from, to] of replacements) {
      if (!content.includes(from)) {
        continue;
      }
      content = content.split(from).join(to);
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }
}

function updatePackageJson(packageJsonPath, options) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const title = options.title || toTitle(options.name);
  const description = options.description || `${title} plugin`;

  packageJson.name = options.name;
  packageJson.description = description;
  if (packageJson.plugin) {
    packageJson.plugin.title = title;
    packageJson.plugin.description = description;
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  ensurePluginName(options.name);

  const repoRoot = path.resolve(options.repo);
  const packagesDir = path.join(repoRoot, 'packages');
  const templateDir = path.join(packagesDir, options.template);
  const targetDir = path.join(packagesDir, options.name);

  if (!fs.existsSync(packagesDir)) {
    throw new Error(`packages directory not found under repo root: ${repoRoot}`);
  }
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template package not found: ${templateDir}`);
  }

  copyDirectory(templateDir, targetDir, options.force);

  const replacements = [
    [TEMPLATE_PLUGIN_ID, options.name],
    ['plugin title', options.title || toTitle(options.name)],
    ['plugin description', options.description || `${toTitle(options.name)} plugin`],
    ['a plugin example', options.description || `${toTitle(options.name)} plugin`],
    ['UiExample', `${toTitle(options.name).replace(/\s+/g, '')}Ui`],
  ];

  replaceInTextFiles(targetDir, replacements);
  updatePackageJson(path.join(targetDir, 'package.json'), options);

  process.stdout.write(`Created plugin: ${targetDir}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
