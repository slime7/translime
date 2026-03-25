import { useLogger } from 'translime-sdk';
import { PLUGIN_ID } from '../shared/constants';
import createHandlers from './handlers';

const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Main' }) : baseLogger;

export const pluginDidLoad = () => {
  logger.info('Bangumi Logs loaded');
};

export const pluginWillUnload = () => {
  logger.info('Bangumi Logs unloaded');
};

export const ipcHandlers = createHandlers();
