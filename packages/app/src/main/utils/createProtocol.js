import { protocol } from 'electron';
import * as path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import logger from './logger';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default (scheme) => {
  if (protocol.isProtocolHandled(scheme)) {
    return;
  }
  protocol.handle(
    scheme,
    async (request) => {
      let pathName = new URL(request.url).pathname;
      pathName = decodeURI(pathName); // Needed in case URL contains spaces

      // 开发模式下若 Dev Server 可用，优先代理 Dev Server 资源
      const devServerUrl = process.env.VITE_DEV_SERVER_URL;
      if (devServerUrl) {
        try {
          const targetUrl = new URL(pathName, devServerUrl).href;
          const devRes = await fetch(targetUrl);
          if (devRes.ok) {
            return new Response(await devRes.arrayBuffer(), {
              headers: {
                'content-type': devRes.headers.get('content-type') || 'application/javascript',
                'access-control-allow-origin': '*',
              },
            });
          }
        } catch {
          // Dev Server 失败时回退到本地静态文件
        }
      }

      try {
        const filePath = path.join(dir, '../renderer', pathName);
        if (!existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        const data = await readFileSync(filePath);
        const extension = path.extname(pathName)
          .toLowerCase();
        let mimeType = '';

        if (extension === '.js') {
          mimeType = 'text/javascript';
        } else if (extension === '.html') {
          mimeType = 'text/html';
        } else if (extension === '.css') {
          mimeType = 'text/css';
        } else if (extension === '.svg' || extension === '.svgz') {
          mimeType = 'image/svg+xml';
        } else if (extension === '.json') {
          mimeType = 'application/json';
        } else if (extension === '.wasm') {
          mimeType = 'application/wasm';
        }

        return new Response(
          data,
          {
            headers: {
              'content-type': mimeType,
              'access-control-allow-origin': '*',
            },
          },
        );
      } catch (err) {
        logger.error(
          `Failed to read ${pathName} on ${scheme} protocol`,
          err,
        );
        return new Response(
          Buffer.from(`<h1>Protocol Handle Error</h1><p>Failed to read ${pathName} on ${scheme} protocol</p>`),
          { headers: { 'content-type': 'text/html' } },
        );
      }
    },
  );
};
