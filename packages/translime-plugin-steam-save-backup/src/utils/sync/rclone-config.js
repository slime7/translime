import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { useLogger } from 'translime-sdk';
import { tailOutput } from './rclone';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';
const baseLogger = useLogger();
// 附加 plugin_id 与 context 元数据
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'rclone' }) : baseLogger;

// 本插件创建的远程统一命名前缀，便于在系统 rclone 配置中识别
export const remoteNameFor = (type) => `translime-${type}`;
// 两段式结构（OAuth 网盘绑定存档目录）中存放令牌/凭据的底层远程名，跟随具体远程名
export const baseNameFor = (name) => `${name}-base`;

/**
 * 内置支持的 rclone 后端与最小字段集。
 * auth: 'oauth' 走 rclone authorize 本地回调；'fields' 用表单凭据创建。
 */
export const BACKEND_TYPES = [
  {
    id: 'drive',
    label: 'Google Drive',
    auth: 'oauth',
    hint: '点击授权后在浏览器完成 Google 登录，rclone 官方应用承担 OAuth',
  },
  {
    id: 'onedrive',
    label: 'OneDrive',
    auth: 'oauth',
    hint: '点击授权后在浏览器完成微软登录，自动选择默认驱动器',
    fields: [
      {
        key: 'drive_type',
        label: '账户类型',
        type: 'select',
        default: 'personal',
        choices: [
          { title: '个人 (Personal)', value: 'personal' },
          { title: '商业 (Business)', value: 'business' },
        ],
      },
    ],
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    auth: 'oauth',
    hint: '点击授权后在浏览器完成 Dropbox 登录',
  },
  {
    id: 'local',
    label: '本地 / 网络路径',
    // 本地路径不写入 rclone 配置：凭据无从谈起，条目只保存在插件配置中，
    // 路径本身即存档根（引擎对本地/UNC 路径 target 原生支持）
    auth: 'local',
    hint: '填写本机磁盘目录或 UNC 网络路径，可作为存档位置添加多个并随时切换',
    fields: [
      {
        key: 'dir',
        label: '路径',
        type: 'text',
        required: true,
        placeholder: '例如：D:\\Backups\\Steam 或 \\\\NAS\\share\\saves',
      },
    ],
  },
  {
    id: 'webdav',
    label: 'WebDAV（坚果云 / Nextcloud / Alist 等）',
    auth: 'fields',
    hint: '填写服务地址与账号密码',
    fields: [
      {
        key: 'url',
        label: '服务地址',
        type: 'text',
        required: true,
        placeholder: '例如：https://dav.jianguoyun.com/dav/',
      },
      {
        key: 'vendor',
        label: '服务类型',
        type: 'select',
        default: 'other',
        choices: [
          { title: '其他 (Other)', value: 'other' },
          { title: 'Nextcloud', value: 'nextcloud' },
          { title: 'ownCloud', value: 'ownCloud' },
          { title: 'SharePoint', value: 'sharepoint' },
        ],
      },
      {
        key: 'user',
        label: '用户名',
        type: 'text',
        required: true,
      },
      {
        key: 'pass',
        label: '密码 / 应用密码',
        type: 'password',
        required: true,
      },
    ],
  },
  {
    id: 'smb',
    label: 'SMB / NAS 共享',
    auth: 'fields',
    hint: '填写 NAS 地址与账号密码',
    fields: [
      {
        key: 'host',
        label: '主机地址',
        type: 'text',
        required: true,
        placeholder: '例如：192.168.1.10',
      },
      {
        key: 'user',
        label: '用户名',
        type: 'text',
        placeholder: '目标设备的账户名（如 Windows / NAS 登录名）',
        // 用户名与域的填写提示
        tooltip: {
          subhead: '用户名与「域」的填写方式',
          lines: [
            { title: 'NAS / Samba 账户', text: '直接填登录账户名，「域」留空。' },
            { title: 'Windows 本地账户', text: '填本地账户名，「域」留空；登录失败时改填目标机器名。' },
            { title: 'Windows 微软账户（邮箱登录）', text: '填完整邮箱，「域」必须填目标机器名，否则会登录失败。' },
            { title: 'Windows AD 域账户', text: '填域内账户名，「域」填 AD 域名（NetBIOS 名，如 CORP）。' },
            { title: '域\\用户名 写法', text: '不会被自动拆分，请分开两栏填写。' },
            { title: '留空', text: '使用本机当前登录的用户名。' },
          ],
        },
      },
      {
        key: 'pass',
        label: '密码',
        type: 'password',
      },
      {
        key: 'domain',
        label: '域（可选）',
        type: 'text',
        placeholder: 'WORKGROUP',
      },
    ],
  },
  {
    id: 'sftp',
    label: 'SFTP',
    auth: 'fields',
    hint: '填写服务器地址与账号密码（密钥登录请直接编辑 rclone 配置）',
    fields: [
      {
        key: 'host',
        label: '主机地址',
        type: 'text',
        required: true,
      },
      {
        key: 'user',
        label: '用户名',
        type: 'text',
        required: true,
      },
      {
        key: 'port',
        label: '端口',
        type: 'text',
        default: '22',
      },
      {
        key: 'pass',
        label: '密码',
        type: 'password',
      },
    ],
  },
  {
    id: 's3',
    label: 'S3 兼容（AWS / R2 / B2 / MinIO 等）',
    auth: 'fields',
    hint: '填写访问密钥；非 AWS 服务需要填写端点',
    fields: [
      {
        key: 'provider',
        label: '服务提供商',
        type: 'select',
        default: 'aws',
        choices: [
          { title: 'AWS S3', value: 'aws' },
          { title: 'Cloudflare R2', value: 'cloudflare' },
          { title: 'MinIO', value: 'minio' },
          { title: '其他 (Other)', value: 'other' },
        ],
      },
      {
        key: 'access_key_id',
        label: 'Access Key ID',
        type: 'text',
        required: true,
      },
      {
        key: 'secret_access_key',
        label: 'Secret Access Key',
        type: 'password',
        required: true,
      },
      {
        key: 'endpoint',
        label: '端点（非 AWS 必填）',
        type: 'text',
        placeholder: '例如：https://<account>.r2.cloudflarestorage.com',
      },
      {
        key: 'region',
        label: '区域（可选）',
        type: 'text',
      },
    ],
  },
];

export const findBackendType = (typeId) => BACKEND_TYPES.find((item) => item.id === typeId) || null;

// 后端定义中的密码类字段 key 集合
const getPasswordKeys = (backend) => new Set((backend?.fields || [])
  .filter((field) => field.type === 'password')
  .map((field) => field.key));

/**
 * 解析 `rclone listremotes` 输出为远程名数组（不含冒号）
 */
export const parseListRemotes = (stdout) => (stdout || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.endsWith(':'))
  .map((line) => line.slice(0, -1));

/**
 * 从 authorize 输出提取本地回调授权链接
 */
export const parseAuthorizeUrl = (stdout) => {
  const match = /https?:\/\/127\.0\.0\.1:\d+\/auth\/\?\S+/.exec(stdout || '');
  return match ? match[0] : null;
};

/**
 * 从 authorize 输出提取 token JSON（扁平对象，不含嵌套花括号）
 */
export const parseAuthorizeToken = (stdout) => {
  const match = /\{[^{}]*"access_token"[^{}]*\}/.exec(stdout || '');
  return match ? match[0] : null;
};

/**
 * 归一化存档目录输入：
 * - 反斜杠统一为正斜杠，去掉首尾分隔符
 * - 空输入视为「不限制」（返回空串）
 * - 拒绝「..」路径段（防止别名锚点逃出存档范围）与冒号、引号（破坏连接字符串语法）
 * 返回 { ok, value, error }
 */
export const normalizeRootDir = (input) => {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return { ok: true, value: '', error: null };
  }
  const unified = raw.replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '');
  if (!unified) {
    return { ok: true, value: '', error: null };
  }
  if (/[:"]/.test(unified)) {
    return { ok: false, value: '', error: '存档目录不能包含冒号或引号' };
  }
  if (unified.split('/').some((segment) => segment === '..')) {
    return { ok: false, value: '', error: '存档目录不能包含「..」路径段' };
  }
  return { ok: true, value: unified, error: null };
};

/**
 * 构建 `rclone config create` 参数。
 * - OAuth：config_token 为 JSON，不能加 --obscure（对应官方 headless 授权配方）
 * - 表单凭据：默认 --obscure 让 rclone 只对密码类字段做混淆存储；
 *   options.obscure = false 时跳过（密码已混淆、原样存储的重建场景）
 * 普通字段去除首尾空白；密码字段原样传递（密码本身可能包含空格）
 */
export const buildCreateArgs = (type, name, values = {}, token = null, options = {}) => {
  const backend = findBackendType(type);
  const args = ['config', 'create', name, type];
  const passwordKeys = getPasswordKeys(backend);

  Object.keys(values).forEach((key) => {
    const value = passwordKeys.has(key)
      ? String(values[key] ?? '')
      : String(values[key] ?? '').trim();
    if (!value) {
      return;
    }
    args.push(`${key}=${value}`);
  });

  if (token) {
    args.push(`config_token=${token}`);
  }
  const obscure = options.obscure !== undefined
    ? Boolean(options.obscure)
    : backend?.auth === 'fields';
  if (obscure) {
    args.push('--obscure');
  }
  if (type === 'onedrive') {
    // 自动完成驱动器选择等后续交互问答
    args.push('--auto-confirm');
  }
  return args;
};

/**
 * 列出系统 rclone 配置中的全部远程
 */
export const listRemotes = async (exec) => {
  const result = await exec(['listremotes']);
  if (result.code !== 0) {
    throw new Error(`读取远程列表失败：${tailOutput(result.stderr)}`);
  }
  return parseListRemotes(result.stdout);
};

/**
 * 为指定后端寻找一个空闲的受管远程名：优先使用规范名 translime-<type>，
 * 已被占用则依次尝试 -2、-3 序号（删除后复用），使同一后端可添加多个远程
 * （多个 SMB、多个网盘账号等）。
 */
export const findFreeRemoteName = async (exec, type) => {
  const remotes = await listRemotes(exec);
  const base = remoteNameFor(type);
  if (!remotes.includes(base)) {
    return base;
  }
  for (let index = 2; ; index += 1) {
    const name = `${base}-${index}`;
    if (!remotes.includes(name)) {
      return name;
    }
  }
};

/**
 * rclone obscure：把明文密码混淆为可安全写入连接字符串的形态
 * （混淆值只含字母数字，rclone 读取连接字符串时对密码类参数自动解混淆）
 */
export const obscureValue = async (exec, plain) => {
  const result = await exec(['obscure', String(plain ?? '')]);
  if (result.code !== 0) {
    throw new Error(`密码混淆失败：${tailOutput(result.stderr)}`);
  }
  return (result.stdout || '').trim();
};

/**
 * 连接字符串参数值转义：含逗号或冒号的值用双引号包裹（rclone 连接字符串语法，
 * 如 webdav/s3 的 url）；混淆后的密码只含字母数字，不会进入此分支
 */
const quoteConnStrValue = (value) => (/[,:]/.test(value) ? `"${value}"` : value);

/**
 * 构建内联凭据的连接字符串 `:type,k=v,...:rootDir`。
 * - password 字段取 obscuredPasses 中的预混淆值（缺失则跳过该字段）
 * - 非密码字段去除首尾空白，空值跳过
 * - 值中含引号直接抛错（rclone 连接字符串无法无损表达，由调用方提示用户改填）
 *
 * @returns {string} 连接字符串
 */
export const buildInlineRemoteValue = (type, values = {}, rootDir = '', obscuredPasses = {}) => {
  const backend = findBackendType(type);
  const passwordKeys = getPasswordKeys(backend);
  const parts = [];
  Object.keys(values).forEach((key) => {
    let value;
    if (passwordKeys.has(key)) {
      value = String(obscuredPasses[key] ?? '').trim();
    } else {
      value = String(values[key] ?? '').trim();
    }
    if (!value) {
      return;
    }
    if (value.includes('"')) {
      throw new Error(`「${key}」不能包含引号，请修改后重试`);
    }
    parts.push(`${key}=${quoteConnStrValue(value)}`);
  });
  const params = parts.length > 0 ? `,${parts.join(',')}` : '';
  return `:${type}${params}:${rootDir}`;
};

/**
 * 解析内联连接字符串 `:type,k=v,...:rootDir`：
 * - 参数段后的第一个冒号即路径段起点（双引号内的冒号属于参数值，rclone 同款语法）
 * - 双引号包裹的值在解析时还原为原始内容
 * 返回 { type, values, rootDir }；格式不符返回 null
 */
export const parseInlineRemoteValue = (remote) => {
  const str = String(remote ?? '');
  if (!str.startsWith(':')) {
    return null;
  }
  // 引号感知地找参数段结束冒号
  let splitAt = -1;
  let inQuote = false;
  for (let i = 1; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ':' && !inQuote) {
      splitAt = i;
      break;
    }
  }
  const header = splitAt === -1 ? str.slice(1) : str.slice(1, splitAt);
  const rootDir = splitAt === -1 ? '' : str.slice(splitAt + 1);
  // 引号感知地按逗号拆参数
  const segments = [];
  let current = '';
  inQuote = false;
  header.split('').forEach((ch) => {
    if (ch === '"') {
      inQuote = !inQuote;
      return;
    }
    if (ch === ',' && !inQuote) {
      segments.push(current);
      current = '';
      return;
    }
    current += ch;
  });
  segments.push(current);
  const [type, ...paramSegments] = segments;
  if (!type) {
    return null;
  }
  const values = {};
  paramSegments.forEach((segment) => {
    const eq = segment.indexOf('=');
    if (eq <= 0) {
      return;
    }
    values[segment.slice(0, eq)] = segment.slice(eq + 1);
  });
  return { type, values, rootDir };
};

/**
 * 解析 alias 远程的 remote= 值：
 * - 内联连接字符串（以 : 开头）→ { mode: 'inline', type, values, rootDir }
 * - 两段式 `baseName:rootDir` → { mode: 'base', baseName, rootDir }
 * - 其他 → null（不是本插件管理的 alias 结构）
 */
export const parseAliasRemoteValue = (remote) => {
  const str = String(remote ?? '');
  if (str.startsWith(':')) {
    const parsed = parseInlineRemoteValue(str);
    return parsed ? { mode: 'inline', ...parsed } : null;
  }
  const idx = str.indexOf(':');
  if (idx <= 0) {
    return null;
  }
  return { mode: 'base', baseName: str.slice(0, idx), rootDir: str.slice(idx + 1) };
};

/**
 * 构建 `rclone config create <name> alias remote=<value>` 参数（不加 --obscure：
 * remote 值中的密码已是混淆态，alias 本身没有敏感字段）
 */
export const buildAliasCreateArgs = (name, remoteValue) => [
  'config',
  'create',
  name,
  'alias',
  `remote=${remoteValue}`,
];

/**
 * 运行 OAuth 授权：rclone 会自动打开默认浏览器，本地回调接收授权结果。
 * 返回 { promise, cancel }；promise resolve 授权 token JSON。
 *
 * @param {string} bin rclone 可执行文件
 * @param {string} type 后端类型（如 drive）
 * @param {{ onUrl?: (url: string) => void, timeoutMs?: number }} [options]
 */
export const runAuthorize = (bin, type, options = {}) => {
  const { onUrl, timeoutMs = 5 * 60 * 1000 } = options;

  let child;
  try {
    child = spawn(bin, ['authorize', type], { windowsHide: true });
  } catch (e) {
    logger.debug(`[rclone] authorize ${type} 启动失败（${bin}）：${e.message}`);
    return {
      promise: Promise.reject(new Error(`无法启动 rclone（${bin}）：${e.message}`)),
      cancel: () => {},
    };
  }

  logger.debug(`[rclone] authorize ${type}：已启动，等待浏览器授权`);

  let settled = false;
  let stdout = '';
  let stderr = '';
  let urlSent = false;

  const timer = setTimeout(() => {
    logger.debug(`[rclone] authorize ${type}：授权超时（${timeoutMs}ms），终止进程`);
    child.kill();
  }, timeoutMs);

  const promise = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!urlSent) {
        const url = parseAuthorizeUrl(stdout);
        if (url) {
          urlSent = true;
          onUrl?.(url);
        }
      }
      const token = parseAuthorizeToken(stdout);
      if (token && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill();
        logger.debug(`[rclone] authorize ${type}：授权完成`);
        resolve(token);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (e) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      logger.debug(`[rclone] authorize ${type} 启动失败：${e.message}`);
      reject(new Error(`无法启动 rclone（${bin}）：${e.message}`));
    });
    child.on('close', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const reason = tailOutput(stderr, 200) || '已取消或超时';
      logger.debug(`[rclone] authorize ${type}：授权未完成（${reason}）`);
      reject(new Error(`授权未完成：${reason}`));
    });
  });

  return {
    promise,
    cancel: () => {
      if (!settled) {
        logger.debug(`[rclone] authorize ${type}：用户取消授权`);
        child.kill();
      }
    },
  };
};

/**
 * 解析键值行文本为对象（值中含等号时保留完整值，密码可能含 =）
 */
export const parseConfigShow = (stdout) => {
  const config = {};
  (stdout || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[')) {
      return;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      return;
    }
    config[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  });
  return config;
};

/**
 * 从 rclone 配置文件内容中提取指定远程节段的键值对象；
 * 节段不存在返回 null（配置文件为整体加密等非 INI 形态时同样视为不存在）
 */
export const parseConfigFileSection = (content, name) => {
  const sectionLines = [];
  let matched = false;
  let inSection = false;
  (content || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inSection = trimmed.slice(1, -1).trim() === name;
      if (inSection) {
        matched = true;
      }
      return;
    }
    if (inSection) {
      sectionLines.push(trimmed);
    }
  });
  if (!matched) {
    return null;
  }
  return parseConfigShow(sectionLines.join('\n'));
};

// rclone 掩码哨兵（config show / dump 输出与误写入的配置都会出现）：
// 真实混淆值只含字母数字，绝不会以 *** 开头
const MASKED_VALUE_PREFIX = '***';

/**
 * 判断值是否为 rclone 的掩码占位（掩码值不能当混淆密码复用，否则连接时报 base64 解码错误）
 */
export const isMaskedValue = (value) => typeof value === 'string' && value.trim().startsWith(MASKED_VALUE_PREFIX);

// 默认读取器：读取 rclone 配置文件原文（密码保持真实混淆态）
const readConfigFileDefault = (configPath) => fs.readFile(configPath, 'utf8');

/**
 * 读取单个远程的原始配置（rclone.conf 原文键值，密码保持真实混淆态，类型缺失时抛错）。
 * rclone 1.68+ 的 config show / config dump 会把密码字段掩码为 "*** ENCRYPTED ***"
 * 且无任何标志可还原真实值，只有配置文件原文里存着混淆值，因此改为读文件解析节段。
 * @param {function} [readFile] 配置文件读取器，仅测试注入用
 */
export const getRemoteRawConfig = async (exec, name, readFile = readConfigFileDefault) => {
  const listResult = await exec(['config', 'file']);
  if (listResult.code !== 0) {
    throw new Error(`读取远程配置失败：${tailOutput(listResult.stderr)}`);
  }
  // 输出末行为配置文件路径（兼容 "stored at" 与 "will be created at" 两种文案）
  const lines = (listResult.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const configPath = lines.at(-1);
  if (!configPath) {
    throw new Error('读取远程配置失败：无法确定 rclone 配置文件路径');
  }
  let content;
  try {
    content = await readFile(configPath);
  } catch (e) {
    throw new Error(`读取远程配置失败：无法读取 rclone 配置文件（${e.message}）`);
  }
  const config = parseConfigFileSection(content, name);
  if (!config) {
    throw new Error(`读取远程配置失败：远程「${name}」不存在`);
  }
  if (!config.type) {
    throw new Error(`远程「${name}」缺少后端类型，请直接编辑 rclone 配置文件`);
  }
  return config;
};

/**
 * 读取远程配置的统一视图（编辑回填与远程列表的数据源）：
 * - 直连：{ mode: 'direct', type, values, rootDir: '', baseName: null }
 * - alias 内联凭据：{ mode: 'inline', type, values（密码保持混淆态）, rootDir, baseName: null }
 * - alias 两段式：{ mode: 'base', type（底层远程类型）, values, rootDir, baseName }
 */
export const getRemoteConfig = async (exec, name) => {
  const raw = await getRemoteRawConfig(exec, name);
  if (raw.type !== 'alias') {
    return {
      mode: 'direct', type: raw.type, values: raw, rootDir: '', baseName: null,
    };
  }
  const parsed = parseAliasRemoteValue(raw.remote);
  if (!parsed) {
    throw new Error(`远程「${name}」的别名配置无法识别，请直接编辑 rclone 配置文件`);
  }
  if (parsed.mode === 'inline') {
    return {
      mode: 'inline',
      type: parsed.type,
      values: parsed.values,
      rootDir: parsed.rootDir,
      baseName: null,
    };
  }
  const baseRaw = await getRemoteRawConfig(exec, parsed.baseName);
  return {
    mode: 'base',
    type: baseRaw.type,
    values: baseRaw,
    rootDir: parsed.rootDir,
    baseName: parsed.baseName,
  };
};

/**
 * 读取远程当前存储的密码类字段（混淆态）与 OAuth token，跨越三种结构取值：
 * 直连 / alias 内联 / alias 两段式（读底层远程）。远程不存在时返回空值。
 * 用于编辑时「密码留空 = 保持不变」的重建。
 * 掩码占位值（*** 开头）一律不返回：复用掩码值会把垃圾写进新配置，导致连接时
 * base64 解码失败（旧版曾把 config show 的掩码输出写回配置引发该故障）。
 */
export const readStoredPasswords = async (exec, name, backend) => {
  const raw = await getRemoteRawConfig(exec, name).catch(() => null);
  if (!raw) {
    return { passwords: {}, token: null };
  }
  const passwordKeys = getPasswordKeys(backend);
  const pick = (config) => {
    const passwords = {};
    passwordKeys.forEach((key) => {
      if (config[key] && !isMaskedValue(config[key])) {
        passwords[key] = config[key];
      }
    });
    return passwords;
  };
  const usableToken = (token) => (token && !isMaskedValue(token) ? token : null);
  if (raw.type === 'alias') {
    const parsed = parseAliasRemoteValue(raw.remote);
    if (parsed?.mode === 'inline') {
      return { passwords: pick(parsed.values), token: null };
    }
    if (parsed?.mode === 'base') {
      const baseRaw = await getRemoteRawConfig(exec, parsed.baseName).catch(() => null);
      if (baseRaw) {
        return { passwords: pick(baseRaw), token: usableToken(baseRaw.config_token) };
      }
    }
    return { passwords: {}, token: null };
  }
  return { passwords: pick(raw), token: usableToken(raw.config_token) };
};

/**
 * 删除远程（两段式 alias 级联删除其凭据远程，不留全盘入口）；不存在视为已删除
 */
export const deleteRemote = async (exec, name) => {
  const remotes = await listRemotes(exec);
  if (!remotes.includes(name)) {
    return;
  }
  // 先读结构再删除：alias 两段式需要连带删除底层凭据远程
  const raw = await getRemoteRawConfig(exec, name).catch(() => null);
  const result = await exec(['config', 'delete', name]);
  if (result.code !== 0) {
    throw new Error(`删除远程失败：${tailOutput(result.stderr)}`);
  }
  if (raw?.type === 'alias') {
    const parsed = parseAliasRemoteValue(raw.remote);
    if (parsed?.mode === 'base' && remotes.includes(parsed.baseName)) {
      const deleteBase = await exec(['config', 'delete', parsed.baseName]);
      if (deleteBase.code !== 0) {
        throw new Error(`删除远程失败：${tailOutput(deleteBase.stderr)}`);
      }
    }
  }
};

/**
 * 创建（重建）命名远程：先删除旧远程（含两段式凭据远程）再按参数创建。
 * - rootDir 为空：直连结构（表单凭据加 --obscure / OAuth token）
 * - 表单后端 + rootDir：alias + 内联凭据连接字符串（远程列表只出现受限远程，
 *   rclone GUI 无法浏览存档目录以外的内容）
 * - OAuth + rootDir：alias 指向凭据远程 baseNameFor(type)（token 无法内联）
 *
 * @param {object} args
 * @param {string} args.type 后端类型
 * @param {string} args.name 远程名
 * @param {object} args.values 表单值（密码为明文；已被 obscuredPasses 覆盖的密码字段忽略明文）
 * @param {string|null} args.token OAuth token（新授权时）
 * @param {string} args.rootDir 归一化后的存档目录（空串 = 不限制）
 * @param {object} args.obscuredPasses 预混淆密码（编辑留空沿用旧值 / 新密码已混淆）
 */
export const createRemote = async (exec, {
  type,
  name,
  values = {},
  token = null,
  rootDir = '',
  obscuredPasses = {},
}) => {
  const backend = findBackendType(type);
  // 前置校验：绑定存档目录的 OAuth 远程必须有令牌，失败时不破坏既有配置
  if (rootDir && backend?.auth === 'oauth' && !token) {
    throw new Error('缺少授权令牌，请重新授权后创建');
  }
  // 统一先把密码类字段解析为混淆值：预混淆（编辑沿用旧值）优先，明文现混淆。
  // 放在删除旧远程之前执行：混淆失败时不破坏既有配置
  const effectiveObscured = { ...obscuredPasses };
  await Promise.all([...getPasswordKeys(backend)].map(async (key) => {
    if (effectiveObscured[key]) {
      return;
    }
    const plain = String(values[key] ?? '');
    if (plain.trim()) {
      effectiveObscured[key] = await obscureValue(exec, plain);
    }
  }));

  await deleteRemote(exec, name);

  if (!rootDir) {
    // 直连：密码已混淆时关闭 --obscure 原样存储（避免二次混淆损坏）
    const hasObscured = Object.keys(effectiveObscured).length > 0;
    const createValues = hasObscured
      ? { ...values, ...effectiveObscured }
      : values;
    const createResult = await exec(buildCreateArgs(type, name, createValues, token, {
      obscure: hasObscured ? false : undefined,
    }));
    if (createResult.code !== 0) {
      throw new Error(`创建远程失败：${tailOutput(createResult.stderr)}`);
    }
    return name;
  }

  if (backend?.auth === 'oauth') {
    // OAuth 两段式：令牌写入底层凭据远程，别名锚定存档目录
    const baseName = baseNameFor(name);
    await deleteRemote(exec, baseName);
    const baseResult = await exec(buildCreateArgs(type, baseName, values, token));
    if (baseResult.code !== 0) {
      throw new Error(`创建远程失败：${tailOutput(baseResult.stderr)}`);
    }
    const aliasResult = await exec(buildAliasCreateArgs(name, `${baseName}:${rootDir}`));
    if (aliasResult.code !== 0) {
      throw new Error(`创建远程失败：${tailOutput(aliasResult.stderr)}`);
    }
    return name;
  }

  // 表单后端内联：凭据写进连接字符串，远程列表只出现受限的别名远程
  const remoteValue = buildInlineRemoteValue(type, values, rootDir, effectiveObscured);
  const aliasResult = await exec(buildAliasCreateArgs(name, remoteValue));
  if (aliasResult.code !== 0) {
    throw new Error(`创建远程失败：${tailOutput(aliasResult.stderr)}`);
  }
  return name;
};

/**
 * 更新既有远程 = 重建：密码留空的字段沿用旧远程存储的混淆值，
 * OAuth 后端沿用旧 token；其余按传入参数整体重建
 * （结构随 rootDir 在直连 / 内联 / 两段式间切换）。
 */
export const updateRemote = async (exec, {
  name, type, values = {}, rootDir = '',
}) => {
  const backend = findBackendType(type);
  const obscuredPasses = {};
  let token = null;
  if (backend?.auth === 'oauth') {
    // OAuth 无表单密码，编辑重建时沿用已授权 token
    ({ token } = await readStoredPasswords(exec, name, backend));
  } else {
    const passwordKeys = getPasswordKeys(backend);
    const hasEmptyPassword = [...passwordKeys]
      .some((key) => !String(values[key] ?? '').trim());
    if (hasEmptyPassword) {
      const stored = await readStoredPasswords(exec, name, backend);
      passwordKeys.forEach((key) => {
        if (!String(values[key] ?? '').trim() && stored.passwords[key]) {
          obscuredPasses[key] = stored.passwords[key];
        }
      });
    }
  }
  return createRemote(exec, {
    type,
    name,
    values,
    token,
    rootDir,
    obscuredPasses,
  });
};

/**
 * 连接测试：列出给定远程路径，验证凭据与可达性。
 * 注意 SMB 等后端的根路径列举（枚举共享名）不触发真实认证，
 * 传入带子路径的目标（如 `name:share`）才能验证凭据。
 * 连接失败不抛错，由调用方决定提示方式。
 */
export const checkRemoteConnection = async (exec, target, options = {}) => {
  const args = ['lsd', target];
  if (options?.configPath) {
    args.push('--config', options.configPath);
  }
  if (Array.isArray(options?.extraArgs) && options.extraArgs.length > 0) {
    args.push(...options.extraArgs);
  }
  const result = await exec(args, { timeoutMs: options?.timeoutMs ?? 30 * 1000 });
  if (result.code === 0) {
    return { ok: true, error: null };
  }
  return { ok: false, error: tailOutput(result.stderr, 300) || `退出码 ${result.code}` };
};

/**
 * 连接测试按钮可用性检查（纯业务规则）
 * 表单后端：基于当前会话表单输入，至少填写了核心地址信息（host 或 url 或 endpoint 等）
 * 本地路径：填写了路径即可
 * OAuth 后端：仅当已保存该类型的受管远程时可用（同类型可存在多个）
 */
export const canTestRemoteConnection = ({
  backend,
  values = {},
  remotes = [],
  type = '',
} = {}) => {
  if (!backend) {
    return false;
  }
  if (backend.auth === 'oauth') {
    return remotes.some((r) => r?.type === type && /^translime-/.test(r?.name || ''));
  }
  const hostVal = String(values?.host || '').trim();
  const urlVal = String(values?.url || '').trim();
  const endpointVal = String(values?.endpoint || '').trim();
  const keyVal = String(values?.access_key_id || '').trim();
  const dirVal = String(values?.dir || '').trim();
  return Boolean(hostVal || urlVal || endpointVal || keyVal || dirVal);
};

/**
 * 运行连接测试：支持基于临时配置文件对表单填写的凭据进行独立测试，
 * 且支持外部取消（isCancelled）、SMB 域自动发现与临时文件安全清理。
 * rootDir 非空时按 alias 结构在临时配置中构建受限远程测试（密码取新输入的
 * 混淆值，或编辑场景下旧远程存储的混淆值）。
 */
export const testRemoteConnection = async ({
  exec,
  type,
  values,
  name,
  subPath = '',
  rootDir = '',
  isCancelled = () => false,
  discoverHostName = null,
} = {}) => {
  let tempConf = null;
  try {
    if (isCancelled()) {
      return { ok: false, error: '测试已取消', cancelled: true };
    }

    // 本地 / 网络路径：不经过 rclone 配置，直接检查目录可达性（目录允许尚不存在）
    if (type === 'local') {
      const dir = String(values?.dir || '').trim();
      if (!dir) {
        return { ok: false, error: '请填写路径' };
      }
      try {
        const stat = await fs.stat(dir);
        if (!stat.isDirectory()) {
          return { ok: false, error: '该路径不是目录' };
        }
        return { ok: true, error: null };
      } catch {
        return {
          ok: true,
          error: null,
          note: '目录不存在，首次备份/同步时会自动创建',
        };
      }
    }

    const normalizedRoot = normalizeRootDir(rootDir);
    let target;
    let testConfigPath = null;
    const extraArgs = [];
    const backend = type ? findBackendType(type) : null;
    const hasPasswordInput = Boolean(String(values?.pass || ''));
    let useExisting = false;
    // alias 结构测试参数：域自动发现时需要整体重拼 remote= 值
    let aliasTest = null;

    // 已存远程 + 未输入新密码 + 不带存档目录：沿用系统远程并叠加覆盖参数测试。
    // alias 结构不认识 --<type>-<key> 覆盖参数，必须走临时配置重建路径
    if (name && backend && backend.auth === 'fields' && !hasPasswordInput && !normalizedRoot.value) {
      try {
        const remotes = await listRemotes(exec);
        if (remotes.includes(name)) {
          useExisting = true;
        }
      } catch {
        useExisting = false;
      }
    }

    if (useExisting) {
      target = `${name}:`;
      (backend.fields || []).forEach((field) => {
        if (field.type === 'password') {
          return;
        }
        if (values && Object.hasOwn(values, field.key)) {
          const rawVal = String(values[field.key] ?? '').trim();
          extraArgs.push(`--${type}-${field.key}`, rawVal);
        }
      });
    } else if (backend && backend.auth === 'fields' && values && typeof values === 'object') {
      tempConf = path.join(os.tmpdir(), `translime-test-${randomUUID()}.conf`);
      testConfigPath = tempConf;
      const testValues = { ...values };

      if (isCancelled()) {
        return { ok: false, error: '测试已取消', cancelled: true };
      }

      let createArgs;
      if (normalizedRoot.value) {
        // alias 结构：新密码现混淆；编辑留空时沿用旧远程的混淆值
        const obscuredPasses = {};
        if (hasPasswordInput) {
          obscuredPasses.pass = await obscureValue(exec, String(values.pass));
        } else if (name) {
          const stored = await readStoredPasswords(exec, name, backend);
          if (stored.passwords.pass) {
            obscuredPasses.pass = stored.passwords.pass;
          }
        }
        aliasTest = { values: testValues, rootDir: normalizedRoot.value, obscuredPasses };
        createArgs = buildAliasCreateArgs(
          'testremote',
          buildInlineRemoteValue(type, testValues, normalizedRoot.value, obscuredPasses),
        );
      } else {
        createArgs = buildCreateArgs(type, 'testremote', testValues);
      }
      createArgs.push('--config', tempConf);
      const createResult = await exec(createArgs);
      if (createResult.code !== 0) {
        return { ok: false, error: createResult.stderr || '配置初始化失败' };
      }
      target = 'testremote:';
    } else {
      target = subPath ? `${name}:${subPath}` : `${name}:`;
    }

    if (isCancelled()) {
      return { ok: false, error: '测试已取消', cancelled: true };
    }

    const connection = await checkRemoteConnection(exec, target, {
      configPath: testConfigPath,
      extraArgs,
    });
    if (isCancelled()) {
      return { ok: false, error: '测试已取消', cancelled: true };
    }

    if (connection.ok === false && connection.error
      && /logon is invalid|bad username|authentication/i.test(connection.error)
      && discoverHostName) {
      const userVal = String(values?.user || '');
      const hostVal = String(values?.host || '');
      if (userVal.includes('@') && !values?.domain && hostVal) {
        const machineName = await discoverHostName(hostVal).catch(() => null);
        if (machineName) {
          let retryConfigPath = testConfigPath;
          if (aliasTest) {
            // alias 测试：把自动发现的域并入连接字符串后整体重写 remote=
            aliasTest.values.domain = machineName;
            const updated = buildInlineRemoteValue(
              type,
              aliasTest.values,
              aliasTest.rootDir,
              aliasTest.obscuredPasses,
            );
            await exec(['config', 'update', 'testremote', `remote=${updated}`, '--config', tempConf]);
          } else if (testConfigPath) {
            await exec(['config', 'update', 'testremote', `domain=${machineName}`, '--obscure', '--config', testConfigPath]);
          } else if (name) {
            await exec(['config', 'update', name, `domain=${machineName}`, '--obscure']);
            retryConfigPath = null;
          }
          const retry = await checkRemoteConnection(exec, target, { configPath: retryConfigPath });
          if (retry.ok) {
            return {
              ok: true,
              error: null,
              note: `已自动补上域 ${machineName}`,
              domain: machineName,
            };
          }
        }
        connection.error += '；用户名含 @ 时按 UPN 登录，需要在「域」中填写目标机器名（可在目标设备上运行 hostname 查看），或改用目标设备的本地账户名';
      }
    }

    // 存档目录尚未创建：rclone 退出码 3（directory not found），首次同步会自动创建
    if (connection.ok === false && normalizedRoot.value
      && /directory not found/i.test(connection.error)) {
      return {
        ok: true,
        error: null,
        note: '连接成功；存档目录尚未创建，首次同步会自动创建',
      };
    }

    return connection;
  } finally {
    if (tempConf) {
      await fs.rm(tempConf, { force: true }).catch(() => {});
    }
  }
};
