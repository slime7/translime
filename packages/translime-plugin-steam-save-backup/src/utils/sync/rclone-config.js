import { spawn } from 'node:child_process';
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
 */
export const buildCreateArgs = (type, name, values = {}, token = null) => {
  const backend = findBackendType(type);
  const args = ['config', 'create', name, type];

  Object.keys(values).forEach((key) => {
    const value = String(values[key] ?? '').trim();
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
