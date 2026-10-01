import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

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

  let child;
  try {
    child = spawn(bin, args, { windowsHide: true });
  } catch (e) {
    reject(new RcloneError(`无法启动 rclone（${bin}）：${e.message}`));
    return;
  }

  onSpawn?.(child);

  let stdout = '';
  let stderr = '';
  let settled = false;

  const timer = setTimeout(() => {
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
    reject(new RcloneError(`无法启动 rclone（${bin}）：${e.message}`));
  });
  child.on('close', (code) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timer);
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
    children.forEach((child) => {
      child.kill();
    });
  };

  return exec;
};
