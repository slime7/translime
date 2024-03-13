import path from 'path';
import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import verCmp from 'semver-compare';
import axios from 'axios';
// eslint-disable-next-line import/no-unresolved
import axiosHttpAdapter from 'axios/unsafe/adapters/http';
import pkg from '../package.json';

const xmlParser = new XMLParser();
const id = pkg.name;
const { mainStore } = global;
const APP_VERSION = mainStore?.APP_VERSION || '0.0.0';
const isVerDot3 = verCmp(APP_VERSION, '0.3.0') >= 0;
const APPDATA_PATH = isVerDot3 ? mainStore.APPDATA_PATH : global.APPDATA_PATH;
const pluginDir = path.resolve(APPDATA_PATH, 'google-domains-ddns');
const logFile = path.resolve(pluginDir, 'logs.txt');
const pluginWin = isVerDot3 ? () => mainStore.getChildWin(`plugin-window-${id}`) : global.childWins[`plugin-window-${id}`];
const ipc = isVerDot3 ? mainStore.ipc() : global.ipc;
const config = isVerDot3 ? mainStore.config : global.store;

let timer;
const checkPluginDir = () => {
  fs.access(pluginDir, fs.constants.F_OK, (err) => {
    if (err) {
      fs.mkdirSync(pluginDir);
    }
  });
};
const logs = [];
const pushLog = (log) => {
  const logContent = `${(new Date()).toString()}: ${log}`;
  logs.push(logContent);
  fs.appendFileSync(logFile, `${logContent}\n`);
  if (logs.length > 300) {
    logs.shift();
  }
  if (pluginWin()) {
    ipc.sendToClient('logs', logs, pluginWin());
  }
};
const getIp = (type = 4) => new Promise(async (resolve, reject) => {
  const url = type === 6 ? 'https://ipv6.icanhazip.com' : 'https://icanhazip.com';
  try {
    const { data } = await axios.get(url, {
      adapter: axiosHttpAdapter,
      responseType: 'text',
    });
    resolve(data.trim());
  } catch (err) {
    reject(new Error(`获取 ipv${type} 失败`));
  }
});
const getRecords = (domain, apiKey) => new Promise(async (resolve, reject) => {
  try {
    const { data } = await axios.get(`https://www.namesilo.com/api/dnsListRecords?version=1&type=xml&key=${apiKey}&domain=${domain}`, {
      adapter: axiosHttpAdapter,
      responseType: 'text',
    });
    const { namesilo } = xmlParser.parse(data);
    if (+namesilo.reply.code !== 300 || namesilo.reply.detail !== 'success') {
      reject(new Error(`获取 dns 记录失败: ${namesilo.reply.detail}(${namesilo.reply.code})`));
    }
    resolve(namesilo.reply.resource_record);
  } catch (err) {
    reject(err);
  }
});
const getRecord = (sub, domain, apiKey, type = 4) => new Promise(async (resolve, reject) => {
  const recordType = type === 6 ? 'AAAA' : 'A';
  try {
    const records = await getRecords(domain, apiKey);
    const currentRecord = records.find((r) => r.host === `${sub}.${domain}` && r.type === recordType);
    if (!currentRecord) {
      reject(new Error('没有指定的 dns 记录'));
    }
    resolve(currentRecord);
  } catch (err) {
    reject(err);
  }
});
const setRecord = (sub, domain, apiKey, recordId, ip) => new Promise(async (resolve, reject) => {
  try {
    const { data } = await axios.get(`https://www.namesilo.com/api/dnsUpdateRecord?version=1&type=xml&key=${apiKey}&domain=${domain}&rrid=${recordId}&rrhost=${sub}&rrvalue=${ip}&rrttl=3600`, {
      adapter: axiosHttpAdapter,
      responseType: 'text',
    });
    const { namesilo } = xmlParser.parse(data);
    if (+namesilo.reply.code !== 300 || namesilo.reply.detail !== 'success') {
      reject(new Error(`设置 dns 记录失败: ${namesilo.reply.detail}(${namesilo.reply.code})`));
    }
    resolve(namesilo);
  } catch (err) {
    reject(new Error('设置 dns 失败'));
  }
});
const main = async (sub, domain, apiKey, type = 4) => {
  try {
    const currentRecord = await getRecord(sub, domain, apiKey, type);
    const ip = await getIp(type);
    if (ip !== currentRecord.value) {
      await setRecord(sub, domain, apiKey, currentRecord.record_id, ip);
      pushLog(`dns 已设置为: ${ip}`);
    } else {
      pushLog('记录 ip 相同');
    }
  } catch (err) {
    pushLog(err.message);
  }
};
const intervalCall = (sub, domain, apiKey, type = 4) => {
  if (type === 'both' || +type === 4) {
    main(sub, domain, apiKey, 4);
  }
  if (type === 'both' || +type === 6) {
    main(sub, domain, apiKey, 6);
  }
  timer = setTimeout(() => {
    intervalCall(sub, domain, apiKey, type);
  }, 30 * 60 * 1000);
};
const start = () => {
  if (timer) {
    return;
  }
  const setting = config.get(`plugin.${id}.settings`, {});
  if (!setting['sub-domain'] || !setting.domain || !setting['api-key']) {
    console.log(setting, !setting['sub-domain'], !setting.domain, !setting['api-key']);
    pushLog('请先配置');
    return;
  }
  intervalCall(setting['sub-domain'], setting.domain, setting['api-key'], setting['ip-type']);
};
const stop = () => {
  clearTimeout(timer);
  timer = null;
};

// 加载时执行
export const pluginDidLoad = () => {
  checkPluginDir();
  const setting = config.get(`plugin.${id}.settings`, {});
  if (setting['start-on-boot']) {
    start();
  }
};

// 禁用时执行
export const pluginWillUnload = () => {
  stop();
};

// 插件设置表单
export const settingMenu = [
  {
    key: 'api-key',
    type: 'password',
    name: 'api key',
    required: true,
  },
  {
    key: 'sub-domain',
    type: 'input',
    name: '子域名',
    required: true,
  },
  {
    key: 'domain',
    type: 'input',
    name: '域名',
    required: true,
  },
  {
    key: 'start-on-boot',
    type: 'switch',
    name: '启动 app 时自动运行',
  },
  {
    key: 'ip-type',
    type: 'radio',
    name: 'ip 类型',
    choices: [
      {
        name: 'ipv4',
        value: 4,
      },
      {
        name: 'ipv6',
        value: 6,
      },
      {
        name: '两者',
        value: 'both',
      },
    ],
  },
];

// ipc 定义
export const ipcHandlers = [
  {
    type: 'start',
    handler: () => () => {
      start();
    },
  },
  {
    type: 'stop',
    handler: () => () => {
      stop();
    },
  },
  {
    type: 'isRunning',
    handler: () => () => {
      if (pluginWin()) {
        ipc.sendToClient('logs', logs, pluginWin());
      }
      return Promise.resolve(!!timer);
    },
  },
];

// 窗口选项
export const windowOptions = {
  minWidth: 320,
  width: 320,
  height: 240,
  frame: false,
  resizable: false,
  transparent: true,
  titleBarStyle: 'default',
};
