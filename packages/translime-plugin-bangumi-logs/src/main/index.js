import { useLogger } from 'translime-sdk';
import { PLUGIN_ID } from '../shared/constants.js';
import { createHandlers } from './handlers.js';

const baseLogger = useLogger();
const logger = baseLogger.child ? baseLogger.child({ plugin_id: PLUGIN_ID, context: 'Main' }) : baseLogger;

const pluginDidLoad = () => {
  logger.info('Bangumi Logs loaded');
};

const pluginWillUnload = () => {
  logger.info('Bangumi Logs unloaded');
};

export default {
  pluginDidLoad,
  pluginWillUnload,
  ipcHandlers: createHandlers(),
};
