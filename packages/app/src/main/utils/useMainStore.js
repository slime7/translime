import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import * as path from 'node:path';
import pkg from '@pkg/../package.json' with { type: 'json' };
import appConfigStore from './appConfigStore';

const filename = fileURLToPath(import.meta.url);
const dir = path.dirname(filename);

const useMainStore = () => {
  const APP_VERSION = pkg.version;
  const ROOT = path.join(dir, '..');
  const APPDATA_PATH = app.getPath('userData');
  const TEMP_DIR = app.getPath('temp');
  const config = appConfigStore;

  return {
    APP_VERSION,
    ROOT,
    APPDATA_PATH,
    TEMP_DIR,
    config,
  };
};

const mainStore = useMainStore();

if (!global.mainStore) {
  global.mainStore = mainStore;
  global.config = mainStore.config;
  global.ROOT = mainStore.ROOT;
  global.APPDATA_PATH = mainStore.APPDATA_PATH;
  global.TEMP_DIR = mainStore.TEMP_DIR;
}

export default mainStore;
