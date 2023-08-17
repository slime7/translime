import { protocol } from 'electron';
import * as path from 'path';
import { readFileSync } from 'fs';
import { URL } from 'url';
import logger from '@pkg/main/logger';

export default (scheme) => {
  if (protocol.isProtocolHandled(scheme)) {
    return;
  }
  protocol.handle(
    scheme,
    async (request) => {
      let pathName = new URL(request.url).pathname;
      pathName = decodeURI(pathName); // Needed in case URL contains spaces

      try {
        const data = await readFileSync(path.join(__dirname, '../renderer', pathName));
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
          { headers: { 'content-type': mimeType } },
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
