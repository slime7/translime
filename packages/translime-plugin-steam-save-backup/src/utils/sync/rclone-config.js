import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tailOutput } from './rclone';

// 本插件创建的远程统一命名，便于在系统 rclone 配置中识别
export const remoteNameFor = (type) => `translime-${type}`;

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
          { title: 'ownCloud', value: 'owncloud' },
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
        placeholder: '用邮箱（UPN）登录 Windows 目标时填目标机器名',
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
 * 构建 `rclone config create` 参数。
 * - OAuth：config_token 为 JSON，不能加 --obscure（对应官方 headless 授权配方）
 * - 表单凭据：--obscure 让 rclone 只对密码类字段做混淆存储
 * 普通字段去除首尾空白；密码字段原样传递（密码本身可能包含空格）
 */
export const buildCreateArgs = (type, name, values = {}, token = null) => {
  const backend = findBackendType(type);
  const args = ['config', 'create', name, type];
  const passwordKeys = new Set((backend?.fields || [])
    .filter((field) => field.type === 'password')
    .map((field) => field.key));

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
  if (backend?.auth === 'fields') {
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
    return {
      promise: Promise.reject(new Error(`无法启动 rclone（${bin}）：${e.message}`)),
      cancel: () => {},
    };
  }

  let settled = false;
  let stdout = '';
  let stderr = '';
  let urlSent = false;

  const timer = setTimeout(() => {
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
      reject(new Error(`无法启动 rclone（${bin}）：${e.message}`));
    });
    child.on('close', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error(`授权未完成：${tailOutput(stderr, 200) || '已取消或超时'}`));
    });
  });

  return {
    promise,
    cancel: () => {
      if (!settled) {
        child.kill();
      }
    },
  };
};

/**
 * 创建（或重建）命名远程。
 * 同名远程先删除再创建：内置类型的最小字段集完整决定远程配置。
 */
export const createRemote = async (exec, {
  type,
  name,
  values = {},
  token = null,
}) => {
  const remotes = await listRemotes(exec);
  if (remotes.includes(name)) {
    const deleteResult = await exec(['config', 'delete', name]);
    if (deleteResult.code !== 0) {
      throw new Error(`删除旧远程失败：${tailOutput(deleteResult.stderr)}`);
    }
  }

  const createResult = await exec(buildCreateArgs(type, name, values, token));
  if (createResult.code !== 0) {
    throw new Error(`创建远程失败：${tailOutput(createResult.stderr)}`);
  }
  return name;
};

/**
 * 构建 `rclone config update` 参数：只携带非空字段（空值字段的处理见 updateRemote）。
 * - 密码不做 trim（密码本身可能包含空格）
 * - 表单后端 --obscure 让 rclone 混淆密码后存储
 */
export const buildUpdateArgs = (type, name, values = {}) => {
  const backend = findBackendType(type);
  const passwordKeys = new Set((backend?.fields || [])
    .filter((field) => field.type === 'password')
    .map((field) => field.key));

  const args = ['config', 'update', name];
  Object.keys(values).forEach((key) => {
    const raw = String(values[key] ?? '');
    const value = passwordKeys.has(key) ? raw : raw.trim();
    if (!value.trim()) {
      return;
    }
    args.push(`${key}=${value}`);
  });
  if (backend?.auth === 'fields') {
    args.push('--obscure');
  }
  return args;
};

/**
 * 解析 `rclone config show <name>` 输出为键值对象（密码保持混淆态）
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
 * 读取单个远程的配置（含类型与混淆态凭据，供编辑回填）
 */
export const getRemoteConfig = async (exec, name) => {
  const result = await exec(['config', 'show', name]);
  if (result.code !== 0) {
    throw new Error(`读取远程配置失败：${tailOutput(result.stderr)}`);
  }
  const config = parseConfigShow(result.stdout);
  if (!config.type) {
    throw new Error(`远程「${name}」缺少后端类型，请直接编辑 rclone 配置文件`);
  }
  return config;
};

/**
 * 更新既有远程：
 * - 非空字段以 config update 携带（密码不做 trim，可能包含空格）
 * - 表单清空的字段以 config unset 从配置移除（写空串会被 rclone 原样存储，
 *   后端会拿到空选项；例如 SMB 的空 domain）
 * - 密码留空 = 保持不变，既不更新也不移除
 */
export const updateRemote = async (exec, { name, type, values = {} }) => {
  const existing = await getRemoteConfig(exec, name).catch(() => ({}));
  const backend = findBackendType(type);
  const passwordKeys = new Set((backend?.fields || [])
    .filter((field) => field.type === 'password')
    .map((field) => field.key));

  const updateArgs = buildUpdateArgs(type, name, values);
  const clearedKeys = [];
  Object.keys(values).forEach((key) => {
    const value = String(values[key] ?? '').trim();
    // existing[key] 需用 != null 判断：配置中已存在但值为空串的键同样要清掉
    if (!value && !passwordKeys.has(key) && existing[key] != null) {
      clearedKeys.push(key);
    }
  });

  if (updateArgs.length > 3) {
    const result = await exec(updateArgs);
    if (result.code !== 0) {
      throw new Error(`更新远程失败：${tailOutput(result.stderr)}`);
    }
  }
  await Promise.all(clearedKeys.map(async (key) => {
    const result = await exec(['config', 'unset', name, key]);
    if (result.code !== 0) {
      throw new Error(`更新远程失败：${tailOutput(result.stderr)}`);
    }
  }));
  return name;
};

/**
 * 删除系统 rclone 配置中的远程（条目不存在视为已删除）
 */
export const deleteRemote = async (exec, name) => {
  const remotes = await listRemotes(exec);
  if (!remotes.includes(name)) {
    return;
  }
  const result = await exec(['config', 'delete', name]);
  if (result.code !== 0) {
    throw new Error(`删除远程失败：${tailOutput(result.stderr)}`);
  }
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
 * OAuth 后端：仅当已保存该类型远程时可用
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
    return remotes.some((r) => r?.name === remoteNameFor(type));
  }
  const hostVal = String(values?.host || '').trim();
  const urlVal = String(values?.url || '').trim();
  const endpointVal = String(values?.endpoint || '').trim();
  const keyVal = String(values?.access_key_id || '').trim();
  return Boolean(hostVal || urlVal || endpointVal || keyVal);
};

/**
 * 运行连接测试：支持基于临时配置文件对表单填写的凭据进行独立测试，
 * 且支持外部取消（isCancelled）、SMB 域自动发现与临时文件安全清理。
 */
export const testRemoteConnection = async ({
  exec,
  type,
  values,
  name,
  subPath = '',
  isCancelled = () => false,
  discoverHostName = null,
} = {}) => {
  let tempConf = null;
  try {
    if (isCancelled()) {
      return { ok: false, error: '测试已取消', cancelled: true };
    }

    let target;
    let testConfigPath = null;
    const extraArgs = [];
    const backend = type ? findBackendType(type) : null;
    const hasPasswordInput = Boolean(String(values?.pass || ''));
    let useExisting = false;

    // 若系统已存在该远程且未填写新密码（密码留空），使用 --<type>-<key> 覆盖用户在表单里修改的最新字段，
    // 原密码继续由系统远程配置提供，避免二次混淆损坏，同时确保表单中修改的最新用户名/主机等立即生效参与测试
    if (name && backend && backend.auth === 'fields' && !hasPasswordInput) {
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

      const createArgs = buildCreateArgs(type, 'testremote', testValues);
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
          if (testConfigPath) {
            await exec(['config', 'update', 'testremote', `domain=${machineName}`, '--obscure', '--config', testConfigPath]);
          } else if (name) {
            await exec(['config', 'update', name, `domain=${machineName}`, '--obscure']);
          }
          const retry = await checkRemoteConnection(exec, target, { configPath: testConfigPath });
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

    return connection;
  } finally {
    if (tempConf) {
      await fs.rm(tempConf, { force: true }).catch(() => {});
    }
  }
};
