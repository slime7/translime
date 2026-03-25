import fs from 'node:fs/promises';
import path from 'node:path';

const LOG_FILE_PATTERN = /^(common|error)-(\d{4}-\d{2}-\d{2})(\d*)\.log$/;
const LOG_SOURCES = ['common', 'error'];

const getLogDir = (appDataPath) => path.resolve(appDataPath, 'logs');

const getLogPath = (appDataPath, source, date) => path.join(getLogDir(appDataPath), `${source}-${date}.log`);

const matchLogFile = (filename) => {
  const match = filename.match(LOG_FILE_PATTERN);
  if (!match) {
    return null;
  }

  return {
    source: match[1],
    date: match[2],
    suffix: match[3] || '',
    filename,
  };
};

const compareShards = (a, b) => {
  const suffixA = a.suffix === '' ? 0 : Number(a.suffix);
  const suffixB = b.suffix === '' ? 0 : Number(b.suffix);
  return suffixA - suffixB;
};

const listMatchedFiles = async (appDataPath) => {
  const logDir = getLogDir(appDataPath);
  try {
    const entries = await fs.readdir(logDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => matchLogFile(entry.name))
      .filter(Boolean)
      .map((file) => ({
        ...file,
        path: path.join(logDir, file.filename),
      }));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const toArray = (value) => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const pickEvent = (record) => {
  if (typeof record.event === 'string' && record.event.trim()) {
    return record.event.trim();
  }
  if (typeof record.label === 'string' && record.label.trim()) {
    return record.label.trim();
  }
  if (typeof record.tag === 'string' && record.tag.trim()) {
    return record.tag.trim();
  }
  if (typeof record.scope === 'string' && record.scope.trim()) {
    return record.scope.trim();
  }
  if (typeof record.pluginName === 'string' && record.pluginName.trim()) {
    return record.pluginName.trim();
  }
  if (typeof record.plugin === 'string' && record.plugin.trim()) {
    return record.plugin.trim();
  }
  return '';
};

const pickData = (record) => {
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data;
  }

  const reservedKeys = new Set([
    'level',
    'message',
    'timestamp',
    'stack',
    'source',
    'event',
    'label',
    'tag',
    'scope',
    'plugin',
    'pluginName',
  ]);
  const extraEntries = Object.entries(record).filter(([key, value]) => {
    if (reservedKeys.has(key)) {
      return false;
    }
    return typeof value !== 'undefined';
  });

  if (!extraEntries.length) {
    return null;
  }

  return Object.fromEntries(extraEntries);
};

const normalizeRecord = (record, source, index) => {
  const timestamp = typeof record.timestamp === 'string' ? record.timestamp : '';
  const level = typeof record.level === 'string' ? record.level : 'info';
  const message = typeof record.message === 'string'
    ? record.message
    : JSON.stringify(record.message ?? '');
  const event = pickEvent(record);
  const data = pickData(record);
  const stack = typeof record.stack === 'string' ? record.stack : '';
  const pluginId = typeof record.plugin_id === 'string' && record.plugin_id.trim()
    ? record.plugin_id.trim()
    : '';

  return {
    id: `${source}-${timestamp || index}-${index}`,
    source,
    timestamp,
    level,
    event,
    message,
    data,
    stack,
    pluginId,
    raw: record,
  };
};

const createParseErrorRecord = (line, source, index, error) => ({
  id: `${source}-parse-error-${index}`,
  source,
  timestamp: '',
  level: 'error',
  event: '日志解析失败',
  message: `无法解析日志内容：${error.message}`,
  data: {
    line,
  },
  stack: '',
  raw: {
    line,
    error: error.message,
  },
  parseError: true,
});

const parseLogContent = (content, source) => {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    try {
      return normalizeRecord(JSON.parse(line), source, index);
    } catch (error) {
      return createParseErrorRecord(line, source, index, error);
    }
  });
};

export const listLogDates = async (appDataPath) => {
  const matchedFiles = await listMatchedFiles(appDataPath);
  const dates = matchedFiles.map((file) => file.date);
  return Array.from(new Set(dates)).sort((a, b) => b.localeCompare(a));
};

export const readLogRecords = async (appDataPath, date) => {
  const result = {
    date,
    files: [],
    records: [],
  };

  const matchedFiles = await listMatchedFiles(appDataPath);
  const fileStates = await Promise.all(LOG_SOURCES.map(async (source) => {
    const sourceFiles = matchedFiles
      .filter((file) => file.source === source && file.date === date)
      .sort(compareShards);

    if (!sourceFiles.length) {
      return [
        {
          file: {
            source,
            path: getLogPath(appDataPath, source, date),
            exists: false,
          },
          records: [],
        },
      ];
    }

    return Promise.all(sourceFiles.map(async (file) => {
      const content = await fs.readFile(file.path, 'utf8');
      return {
        file: {
          source,
          path: file.path,
          exists: true,
          suffix: file.suffix,
        },
        records: parseLogContent(content, source),
      };
    }));
  }));

  result.files = fileStates.flat().map((item) => item.file);
  result.records = fileStates
    .flat()
    .flatMap((item) => item.records)
    .sort((a, b) => {
      const timeA = Date.parse(a.timestamp || '');
      const timeB = Date.parse(b.timestamp || '');
      if (Number.isNaN(timeA) && Number.isNaN(timeB)) {
        return b.id.localeCompare(a.id);
      }
      if (Number.isNaN(timeA)) {
        return 1;
      }
      if (Number.isNaN(timeB)) {
        return -1;
      }
      return timeB - timeA;
    });

  return result;
};

export const logViewerUtils = {
  getLogDir,
  getLogPath,
  matchLogFile,
  parseLogContent,
  listLogDates,
  readLogRecords,
  toArray,
};

export default logViewerUtils;
