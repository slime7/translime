import path from 'path';
import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import verCmp from 'semver-compare';
import axios from 'axios';
// eslint-disable-next-line import/no-unresolved, import/extensions
import axiosHttpAdapter from 'axios/unsafe/adapters/http.js';
import { useLogger } from 'translime-sdk';
import pkg from '../package.json';

const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: pkg.name, context: 'Main' }) : baseLogger;

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  trimValues: true,
});
const id = pkg.name;
const { mainStore, appManager } = global;
const APP_VERSION = mainStore?.APP_VERSION || '0.0.0';
const isVerDot3 = verCmp(APP_VERSION, '0.3.0') >= 0;
const APPDATA_PATH = isVerDot3 ? mainStore.APPDATA_PATH : global.APPDATA_PATH;
const pluginDir = path.resolve(APPDATA_PATH, 'namesilo-ddns');
const logFile = path.resolve(pluginDir, 'logs.txt');
const pluginWin = isVerDot3 ? () => appManager.getChildWin(`plugin-window-${id}`) : () => global.childWins[`plugin-window-${id}`];
const ipc = isVerDot3 ? appManager.getIpc() : global.ipc;
const config = isVerDot3 ? mainStore.config : global.store;

const LOOP_INTERVAL = 30 * 60 * 1000;
let timer = null;
let isRunning = false;
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
const getIp = async (type = 4) => {
  const url = type === 6 ? 'https://ipv6.icanhazip.com' : 'https://ipv4.icanhazip.com';
  logger.debug(`正在获取公网 IPv${type}, URL: ${url}`);
  try {
    const adapter = axiosHttpAdapter.default || axiosHttpAdapter;
    const { data } = await axios.get(url, {
      adapter,
      responseType: 'text',
    });
    const ip = data.trim();
    logger.debug(`获取成功 IPv${type}: ${ip}`);
    return ip;
  } catch (err) {
    logger.error(`获取 IPv${type} 失败:`, err);
    throw new Error(`获取 ipv${type} 失败`);
  }
};
const getRecords = async (domain, apiKey) => {
  logger.debug(`正在获取域名 ${domain} 的 DNS 记录`);
  const adapter = axiosHttpAdapter.default || axiosHttpAdapter;
  const { data } = await axios.get(`https://www.namesilo.com/api/dnsListRecords?version=1&type=xml&key=${apiKey}&domain=${domain}`, {
    adapter,
    responseType: 'text',
  });
  logger.debug(`Namesilo dnsListRecords 原始响应: ${data.slice(0, 500)}${data.length > 500 ? '...' : ''}`);
  const res = xmlParser.parse(data);
  const reply = res?.namesilo?.reply;
  if (!reply || Number(reply.code) !== 300 || String(reply.detail) !== 'success') {
    logger.error('获取 DNS 列表失败, Namesilo 响应:', { data: { reply } });
    throw new Error(`获取 dns 记录失败: ${reply?.detail || '未知错误'}(${reply?.code || '无代码'})`);
  }
  let records = reply.resource_record;
  if (records && !Array.isArray(records)) {
    records = [records];
  }
  logger.debug(`成功解析到 ${records?.length || 0} 条资源记录`);
  return records || [];
};
const getRecord = async (sub, domain, apiKey, type = 4) => {
  const recordType = type === 6 ? 'AAAA' : 'A';
  const fullHost = sub === '@' ? domain : `${sub}.${domain}`;
  logger.debug(`正在检索记录: [Type: ${recordType}] [Target: ${fullHost}] (Sub: ${sub}, Domain: ${domain})`);

  const records = await getRecords(domain, apiKey);
  // Namesilo 的 host 可能是完整域名，也可能只是子域名部分，这里做兼容匹配
  const currentRecord = records.find((r) => {
    const rHost = String(r.host || '').trim();
    const rType = String(r.type || '').trim();
    return (rHost === fullHost || rHost === sub) && rType === recordType;
  });

  if (!currentRecord) {
    logger.warn(`未能在记录列表中找到匹配项。现有记录概览: ${JSON.stringify(records.map((r) => ({ host: r.host, type: r.type })))}`);
    throw new Error('没有指定的 dns record (请检查子域名设置是否正确且已存在)');
  }
  logger.debug(`找到匹配记录: ID=${currentRecord.record_id}, CurrentValue=${currentRecord.value}`);
  return currentRecord;
};
const setRecord = async (sub, domain, apiKey, recordId, ip) => {
  logger.info(`正在尝试更新 DNS 记录: ${sub}.${domain} -> ${ip} (ID: ${recordId})`);
  try {
    const adapter = axiosHttpAdapter.default || axiosHttpAdapter;
    const { data } = await axios.get(`https://www.namesilo.com/api/dnsUpdateRecord?version=1&type=xml&key=${apiKey}&domain=${domain}&rrid=${recordId}&rrhost=${sub}&rrvalue=${ip}&rrttl=3600`, {
      adapter,
      responseType: 'text',
    });
    logger.debug(`Namesilo dnsUpdateRecord 原始响应: ${data}`);
    const res = xmlParser.parse(data);
    const reply = res?.namesilo?.reply;
    if (!reply || Number(reply.code) !== 300 || String(reply.detail) !== 'success') {
      logger.error('设置 DNS 记录失败, Namesilo 响应:', { data: { reply } });
      throw new Error(`设置 dns 记录失败: ${reply?.detail || '未知错误'}(${reply?.code || '无代码'})`);
    }
    logger.info(`DNS 记录更新成功: ${sub}.${domain} -> ${ip}`);
    return reply;
  } catch (err) {
    logger.error('设置 DNS 失败:', err);
    throw new Error(err.message || '设置 dns 失败');
  }
};
const main = async (sub, domain, apiKey, type = 4) => {
  logger.debug(`开始任务 IPv${type}: ${sub}.${domain}`);
  try {
    const currentRecord = await getRecord(sub, domain, apiKey, type);
    const ip = await getIp(type);
    logger.debug(`当前解析 IP: ${currentRecord.value}, 公网检测 IP: ${ip}`);
    if (ip !== String(currentRecord.value)) {
      await setRecord(sub, domain, apiKey, currentRecord.record_id, ip);
      pushLog(`dns 已设置为: ${ip}`);
    } else {
      pushLog(`记录 ip 相同 (${ip})`);
    }
  } catch (err) {
    logger.error(`任务执行出错 IPv${type}:`, err);
    pushLog(err.message);
  }
};
const getSetting = () => {
  const setting = config.get(`plugin.${id}.settings`, {});
  if (!setting['sub-domain'] || !setting.domain || !setting['api-key']) {
    return null;
  }
  return setting;
};
const intervalCall = async () => {
  logger.debug('进入周期检测任务...');
  const setting = getSetting();
  if (!setting) {
    logger.warn('检测到未配置插件，任务终止');
    pushLog('请先配置');
  } else {
    const {
      'sub-domain': sub,
      domain,
      'api-key': apiKey,
      'ip-type': type,
    } = setting;
    logger.debug(`执行配置: ${sub}.${domain} [Type: ${type}]`);
    const tasks = [];
    if (type === 'both' || String(type) === '4') {
      tasks.push(main(sub, domain, apiKey, 4));
    }
    if (type === 'both' || String(type) === '6') {
      tasks.push(main(sub, domain, apiKey, 6));
    }
    await Promise.all(tasks);
  }
  if (!isRunning) {
    logger.debug('检测到 isRunning 为 false，不再进行下次调度');
    return;
  }
  logger.debug(`任务执行完毕，下次调度将在 ${LOOP_INTERVAL / 1000 / 60} 分钟后`);
  timer = setTimeout(() => {
    intervalCall();
  }, LOOP_INTERVAL);
};
const start = () => {
  if (isRunning) {
    return;
  }
  if (!getSetting()) {
    pushLog('请先配置');
    return;
  }
  isRunning = true;
  intervalCall();
};
const stop = () => {
  isRunning = false;
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  timer = null;
};

// 加载时执行
export const pluginDidLoad = () => {
  logger.info('插件正在加载: Namesilo DNS');
  checkPluginDir();
  const setting = config.get(`plugin.${id}.settings`, {});
  if (setting['start-on-boot']) {
    logger.info('检测到开机启动配置，正在启动任务');
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
      return true;
    },
  },
  {
    type: 'stop',
    handler: () => () => {
      stop();
      return true;
    },
  },
  {
    type: 'isRunning',
    handler: () => () => {
      if (pluginWin()) {
        ipc.sendToClient('logs', logs, pluginWin());
      }
      return isRunning;
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
