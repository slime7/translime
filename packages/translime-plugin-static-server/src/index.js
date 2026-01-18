import http from 'http';
import serveHandler from 'serve-handler';
import detectPort from 'detect-port';

const id = 'translime-plugin-static-server';
const { appManager } = global;
const pluginWin = () => appManager.getChildWin(`plugin-window-${id}`);
let currentPort = 0;
const servers = {};

const isPortFree = (port) => new Promise((resolve) => {
  detectPort(port, (err, portAlt) => {
    if (port === portAlt) {
      resolve(true);
    }
    resolve(false);
  });
});
const closeAllServer = () => {
  Object.entries(servers).forEach(([port, server]) => {
    server.server.close(() => {
      delete servers[+port];
      if (!servers.length) {
        currentPort = 0;
      }
    });
  });
};

// 禁用时执行
export const pluginWillUnload = () => {
  closeAllServer();
};

// 插件上下文菜单
// https://www.electronjs.org/zh/docs/latest/api/menu-item
export const pluginMenu = [
  {
    id: 'close-all',
    label: '关闭所有服务',
    click() {
      closeAllServer();
    },
  },
];

// ipc 定义
export const ipcHandlers = [
  {
    type: 'new-server',
    handler: ({ sendToClient }) => async (path) => {
      const defaultPort = 8080;
      let port = currentPort || defaultPort;
      // eslint-disable-next-line no-await-in-loop
      while (!await isPortFree(port)) {
        port += 1;
      }
      currentPort = port;

      const server = http.createServer((request, response) => serveHandler(request, response, {
        public: path,
        cleanUrls: false,
      }));
      server.on('close', () => {
        sendToClient(`server-closed@${id}`, {
          port,
        }, pluginWin());
      });
      server.listen(currentPort);
      servers[+currentPort] = {
        server,
        port,
        path,
      };
      return currentPort;
    },
  },
  {
    type: 'close-server',
    handler: () => async (port) => {
      if (servers[+port]) {
        return new Promise((resolve) => {
          servers[+port].server.close(() => {
            delete servers[+port];
            resolve(true);
          });
        });
      }
      return true;
    },
  },
  {
    type: 'get-server-list',
    handler: () => async () => {
      const serverList = Object.entries(servers).map(([port, server]) => ({
        port,
        path: server.path,
      }));
      return serverList;
    },
  },
];
