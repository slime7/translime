import { spawn } from 'node:child_process';
import { useLogger } from 'translime-sdk';

const PLUGIN_ID = 'translime-plugin-steam-save-backup';
const baseLogger = useLogger();
// 附加 plugin_id 与 context 元数据
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'rclone' }) : baseLogger;

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// 匹配敏感参数键名
const SENSITIVE_KEY_RE = /pass|secret|token|key/i;

/**
 * 脱敏命令行参数中的敏感凭据。
 */
export const redactArgs = (args) => {
  let maskNext = false;
  return args.map((arg) => {
    if (maskNext) {
      maskNext = false;
      return '***';
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        return SENSITIVE_KEY_RE.test(arg.slice(2, eq)) ? `${arg.slice(0, eq + 1)}***` : arg;
      }
      if (SENSITIVE_KEY_RE.test(arg.slice(2))) {
        maskNext = true;
      }
      return arg;
    }
    const eq = arg.indexOf('=');
    if (eq > 0 && SENSITIVE_KEY_RE.test(arg.slice(0, eq))) {
      return `${arg.slice(0, eq)}=***`;
    }
    return arg;
  });
};

export class RcloneError extends Error {
  constructor(message, { code = null, stderr = '' } = {}) {
    super(message);
    this.name = 'RcloneError';
    this.code = code;
    this.stderr = stderr;
  }
}

// rclone 退出码 3 = 目录不存在（首次同步时远端根目录尚未创建）
export const isRemoteNotFound = (result) => result.code === 3
  || /directory not found/i.test(result.stderr || '');

export const tailOutput = (text, max = 500) => {
  if (!text) {
    return '';
  }
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(cleaned.length - max) : cleaned;
};

/**
 * 运行一次 rclone 命令，返回 { code, stdout, stderr }
 * 进程启动失败（如未安装）时 reject；命令非零退出不 reject，由调用方按退出码分支处理
 */
export const runRclone = (bin, args, options = {}) => new Promise((resolve, reject) => {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, onSpawn } = options;
  const printable = redactArgs(args).join(' ');
  const startedAt = Date.now();

  let child;
  try {
    child = spawn(bin, args, { windowsHide: true });
  } catch (e) {
    logger.debug(`[rclone] 启动失败：${bin} ${printable}（${e.message}）`);
    reject(new RcloneError(`无法启动 rclone（${bin}）：${e.message}`));
    return;
  }

  logger.debug(`[rclone] 执行：${bin} ${printable}`);

  onSpawn?.(child);

  let stdout = '';
  let stderr = '';
  let settled = false;

  const timer = setTimeout(() => {
    logger.debug(`[rclone] 超时（${timeoutMs}ms）终止：${args[0] || ''}`);
    child.kill();
  }, timeoutMs);

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
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
    logger.debug(`[rclone] 启动失败：${bin} ${printable}（${e.message}）`);
    reject(new RcloneError(`无法启动 rclone（${bin}）：${e.message}`));
  });
  child.on('close', (code) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timer);
    const costMs = Date.now() - startedAt;
    const detail = tailOutput(stderr, 300);
    logger.debug(`[rclone] 退出码 ${code}：${args[0] || ''}（${costMs}ms）${detail ? ` ${detail}` : ''}`);
    resolve({ code, stdout, stderr });
  });
});

// 从 `rclone version` 输出解析版本号
export const parseRcloneVersion = (stdout) => {
  const match = /rclone v(\S+)/.exec(stdout || '');
  return match ? match[1] : null;
};

/**
 * 探测 rclone 可用性
 * @returns {Promise<{ok: boolean, version: string|null, path: string, error: string|null}>}
 */
export const probeRclone = async (bin) => {
  try {
    const result = await runRclone(bin, ['version'], { timeoutMs: 15000 });
    if (result.code !== 0) {
      return {
        ok: false,
        version: null,
        path: bin,
        error: `退出码 ${result.code}：${tailOutput(result.stderr, 200) || '未知错误'}`,
      };
    }
    const version = parseRcloneVersion(result.stdout);
    if (!version) {
      return {
        ok: false, version: null, path: bin, error: '无法识别版本输出',
      };
    }
    return {
      ok: true, version, path: bin, error: null,
    };
  } catch (e) {
    return {
      ok: false, version: null, path: bin, error: e.message,
    };
  }
};

/**
 * 创建 exec(args, options) => { code, stdout, stderr }，
 * 运行期注册子进程，供取消同步时统一 kill
 */
export const createExec = (resolveBin) => {
  const children = new Set();

  const exec = async (args, options = {}) => {
    const bin = await resolveBin();
    return runRclone(bin, args, {
      timeoutMs: options.timeoutMs,
      onSpawn: (child) => {
        children.add(child);
        child.on('close', () => {
          children.delete(child);
        });
      },
    });
  };

  exec.killAll = () => {
    if (children.size > 0) {
      logger.debug(`[rclone] 终止进行中的 rclone 进程（${children.size} 个）`);
    }
    children.forEach((child) => {
      child.kill();
    });
  };

  return exec;
};
