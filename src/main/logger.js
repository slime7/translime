import path from 'path';
import { createLogger, format, transports } from 'winston';
import dayjs from 'dayjs';
import mainStore from '@pkg/main/utils/useMainStore';

const create = () => {
  const date = dayjs().format('YYYY-MM-DD');

  const logDir = path.resolve(mainStore.APPDATA_PATH, 'logs');
  const filename = path.join(logDir, `common-${date}.log`);
  const filenameError = path.join(logDir, `error-${date}.log`);
  const logFormat = format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.json(),
  );
  return createLogger({
    transports: [
      new transports.Console({
        format: logFormat,
      }),
      new transports.File({
        filename: filenameError,
        level: 'error',
        format: logFormat,
        maxsize: 3000000,
      }),
      new transports.File({
        filename,
        level: process.env.NODE_ENV === 'development' ? 'silly' : 'verbose',
        format: logFormat,
        maxsize: 3000000,
      }),
    ],
  });
};
const logger = create();

export default logger;
